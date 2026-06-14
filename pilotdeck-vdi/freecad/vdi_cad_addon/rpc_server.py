"""XML-RPC server for VDI CAD — runs inside FreeCAD GUI process.

绘图必须在 Qt 主线程执行。RPC 工作线程不得调用 FreeCAD API（否则闪退）。
"""

import json
import logging
import os
import threading
import time
import xmlrpc.server
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

# 0.0.0.0 允许 Docker (host.docker.internal) 访问；仅本机可用时设 VDI_CAD_RPC_BIND=127.0.0.1
DEFAULT_HOST = os.environ.get("VDI_CAD_RPC_BIND", "0.0.0.0")
DEFAULT_PORT = int(os.environ.get("VDI_CAD_RPC_PORT", "9876"))
DISPATCH_TIMEOUT_S = 300

_server_thread: Optional[threading.Thread] = None
_main_queue: List[Dict] = []
_main_queue_lock = threading.Lock()
_timer = None
_worker = None
_dispatcher_ready = False
_last_result: Dict[str, Any] = {"status": "idle"}


def _get_qt_core():
    try:
        from PySide2 import QtCore
        return QtCore
    except ImportError:
        from PySide6 import QtCore
        return QtCore


def _drain_queue():
    """仅在 Qt 主线程调用。"""
    with _main_queue_lock:
        batch = list(_main_queue)
        _main_queue.clear()
    for item in batch:
        holder = item["holder"]
        try:
            holder["result"] = item["func"](*item["args"], **item.get("kwargs", {}))
        except Exception as e:
            holder["error"] = str(e)
            logger.exception("Main thread execution failed")
        finally:
            holder["done"] = True
            item["event"].set()


def _init_main_thread_dispatcher():
    """在 InitGui/Init.py 主线程创建 QTimer + Worker。"""
    global _timer, _worker, _dispatcher_ready
    if _dispatcher_ready:
        return

    QtCore = _get_qt_core()
    parent = None
    try:
        import FreeCADGui as Gui
        parent = Gui.getMainWindow()
    except Exception:
        pass

    class _MainThreadWorker(QtCore.QObject):
        @QtCore.Slot()
        def process_queue(self):
            _drain_queue()

    _worker = _MainThreadWorker()
    _timer = QtCore.QTimer(parent)
    _timer.timeout.connect(_worker.process_queue)
    _timer.start(50)
    _dispatcher_ready = True
    logger.info("VDI CAD main-thread dispatcher ready")


def _nudge_main_thread():
    """从 RPC 线程安全地请求主线程排空队列（QueuedConnection）。"""
    if _worker is None:
        return
    try:
        QtCore = _get_qt_core()
        QtCore.QMetaObject.invokeMethod(
            _worker,
            "process_queue",
            QtCore.Qt.QueuedConnection,
        )
    except Exception:
        pass


def _dispatch_on_main_thread(func: Callable, *args, **kwargs) -> Dict[str, Any]:
    """入队后在 RPC 线程等待；绝不直接调用 FreeCAD API。"""
    if not _dispatcher_ready:
        return {
            "status": "error",
            "message": "Main-thread dispatcher not ready — restart FreeCAD (Cmd+Q) after deploy",
        }

    holder: Dict[str, Any] = {"done": False, "result": None, "error": None}
    event = threading.Event()

    with _main_queue_lock:
        _main_queue.append(
            {"func": func, "args": args, "kwargs": kwargs, "holder": holder, "event": event}
        )

    _nudge_main_thread()
    deadline = time.time() + DISPATCH_TIMEOUT_S
    while not holder["done"]:
        if event.wait(timeout=0.1):
            break
        _nudge_main_thread()
        if time.time() > deadline:
            break

    if not holder["done"]:
        return {"status": "error", "message": f"Execution timeout ({DISPATCH_TIMEOUT_S}s)"}
    if holder["error"]:
        return {"status": "error", "message": holder["error"]}
    return holder["result"] if holder["result"] is not None else {"status": "success"}


class VdiCadRPC:
    """XML-RPC method handlers."""

    def ping(self) -> str:
        return "pong"

    def status(self) -> Dict[str, Any]:
        import FreeCAD as App

        doc = App.ActiveDocument
        return {
            "status": "running",
            "active_document": doc.Name if doc else None,
            "pending_commands": len(_main_queue),
            "dispatcher_ready": _dispatcher_ready,
            "last_result": _last_result,
        }

    def execute(self, command_json: str) -> Dict[str, Any]:
        global _last_result
        try:
            command = json.loads(command_json)
        except json.JSONDecodeError as e:
            return {"status": "error", "message": f"Invalid JSON: {e}"}

        def _do_execute(cmd):
            import importlib
            import engine.export
            import engine.object_factory
            import engine.pfd
            import engine.pipeline
            import engine.pid
            import engine.symbols
            import engine.utils
            import engine.view
            import engine.layout
            import engine.drawing_cleanup
            import engine.sheet
            import engine.symbol_renderer
            for mod in (
                engine.utils,
                engine.layout,
                engine.symbols,
                engine.symbol_renderer,
                engine.object_factory,
                engine.pfd,
                engine.pid,
                engine.export,
                engine.sheet,
                engine.drawing_cleanup,
                engine.view,
                engine.pipeline,
            ):
                importlib.reload(mod)
            return engine.pipeline.execute_command(cmd)

        result = _dispatch_on_main_thread(_do_execute, command)
        _last_result = result
        return result

    def extract_plant_model(self, project_id: str = "", revision: str = "A") -> Dict[str, Any]:
        def _do_extract(pid, rev):
            import importlib
            import engine.pipeline
            importlib.reload(engine.pipeline)
            return engine.pipeline.extract_plant_model_command(pid, rev)

        return _dispatch_on_main_thread(_do_extract, project_id, revision)

    def apply_delta(self, delta_json: str) -> Dict[str, Any]:
        try:
            delta = json.loads(delta_json)
        except json.JSONDecodeError as e:
            return {"status": "error", "message": f"Invalid JSON: {e}"}

        def _do_apply(d):
            import importlib
            import engine.pipeline
            importlib.reload(engine.pipeline)
            return engine.pipeline.apply_delta_command(d)

        return _dispatch_on_main_thread(_do_apply, delta)

    def get_object(self, object_id: str) -> Dict[str, Any]:
        def _do_get(oid):
            import importlib
            import engine.pipeline
            importlib.reload(engine.pipeline)
            return engine.pipeline.get_object_command(oid)

        return _dispatch_on_main_thread(_do_get, object_id)

    def resolve_pick(self, doc_name: str, selection_json: str, pick_mode: str = "techdraw") -> Dict[str, Any]:
        def _do_resolve(dn, sel, mode):
            import importlib
            import engine.pipeline
            importlib.reload(engine.pipeline)
            return engine.pipeline.resolve_pick_command(dn, sel, pick_mode=mode)

        return _dispatch_on_main_thread(_do_resolve, doc_name, selection_json, pick_mode)

    def resolve_pick_at(self, doc_name: str, pick_json: str, pick_mode: str = "techdraw") -> Dict[str, Any]:
        def _do_resolve(dn, pj, mode):
            import importlib
            import engine.pipeline
            importlib.reload(engine.pipeline)
            return engine.pipeline.resolve_pick_at_command(dn, pj, pick_mode=mode)

        return _dispatch_on_main_thread(_do_resolve, doc_name, pick_json, pick_mode)

    def diagnose_pick(self, doc_name: str = "") -> Dict[str, Any]:
        def _do_diag(dn):
            import importlib
            import engine.pipeline
            import engine.pick_resolver
            importlib.reload(engine.pick_resolver)
            importlib.reload(engine.pipeline)
            return engine.pipeline.diagnose_pick_command(dn)

        return _dispatch_on_main_thread(_do_diag, doc_name)

    def load_plant_model(self, model_json: str, render_json: str = "") -> Dict[str, Any]:
        try:
            model = json.loads(model_json)
        except json.JSONDecodeError as e:
            return {"status": "error", "message": f"Invalid model JSON: {e}"}

        render_cmd = None
        if render_json:
            try:
                render_cmd = json.loads(render_json)
            except json.JSONDecodeError as e:
                return {"status": "error", "message": f"Invalid render JSON: {e}"}

        def _do_load(m, rc):
            import importlib
            import engine.pipeline
            importlib.reload(engine.pipeline)
            return engine.pipeline.load_plant_model_command(m, rc)

        return _dispatch_on_main_thread(_do_load, model, render_cmd)

    def export(self, format_type: str, output_path: str) -> Dict[str, Any]:
        def _do_export(fmt, path):
            from engine.export import export_document
            return export_document(fmt, path)

        return _dispatch_on_main_thread(_do_export, format_type, output_path)

    def screenshot(self, output_path: str) -> Dict[str, Any]:
        def _do_screenshot(path):
            try:
                import FreeCADGui as Gui

                view = Gui.ActiveDocument.ActiveView if Gui.activeDocument() else None
                if not view:
                    return {"status": "error", "message": "No active view"}
                view.saveImage(path, 1920, 1080, "Current")
                return {"status": "success", "path": path}
            except Exception as e:
                return {"status": "error", "message": str(e)}

        return _dispatch_on_main_thread(_do_screenshot, output_path)


def start_server(host: str = DEFAULT_HOST, port: int = DEFAULT_PORT):
    global _server_thread

    _init_main_thread_dispatcher()

    if _server_thread and _server_thread.is_alive():
        return

    def _serve():
        server = xmlrpc.server.SimpleXMLRPCServer(
            (host, port),
            allow_none=True,
            logRequests=False,
        )
        server.register_instance(VdiCadRPC())
        server.register_introspection_functions()
        logger.info("VDI CAD RPC listening on %s:%s", host, port)
        server.serve_forever()

    _server_thread = threading.Thread(target=_serve, daemon=True, name="vdi-cad-rpc")
    _server_thread.start()
