"""
FreeCAD MCP 风格宏执行桥接（参考 https://github.com/ATOI-Ming/FreeCAD-MCP）

在 CadIntelligence 内提供同类能力：规范化宏代码、主线程执行、recompute、视图调整。
可与外部 MCP 客户端配合，也可被 AI 生成的 Python 片段调用。
"""

import logging
import textwrap
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

MACRO_HEADER = textwrap.dedent(
    """
    import FreeCAD as App
    import FreeCADGui as Gui
    import Part
    import math
    """
).strip()


def normalize_macro_code(code: str) -> str:
    code = code.strip()
    if "import FreeCAD" not in code:
        code = MACRO_HEADER + "\n\n" + code
    if "recompute()" not in code:
        code += "\n\nif App.ActiveDocument:\n    App.ActiveDocument.recompute()\n"
    return code


def run_macro_code(code: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """在当前 FreeCAD 进程主线程执行 Python 代码（调用方须在 GUI 主线程）"""
    try:
        import FreeCAD as App

        namespace = {
            "App": App,
            "params": params or {},
            "__builtins__": __builtins__,
        }
        try:
            import FreeCADGui as Gui
            namespace["Gui"] = Gui
        except ImportError:
            Gui = None  # type: ignore

        try:
            import Part
            namespace["Part"] = Part
        except ImportError:
            pass

        normalized = normalize_macro_code(code)
        exec(normalized, namespace)  # noqa: S102 — FreeCAD MCP 同类用法

        if App.ActiveDocument:
            App.ActiveDocument.recompute()
        try:
            if Gui and Gui.activeDocument():
                Gui.activeDocument().activeView().viewAxonometric()
                Gui.SendMsgToActiveView("ViewFit")
        except Exception:
            pass

        return {"status": "success", "message": "宏执行完成"}
    except Exception as e:
        logger.exception("宏执行失败")
        return {"status": "error", "message": str(e)}


def run_scheme_via_pipeline(scheme: Dict[str, Any]) -> Dict[str, Any]:
    """优先走 DrawingPipeline；失败时可回退宏模式"""
    from core.drawing_pipeline import DrawingPipeline

    pipeline = DrawingPipeline(use_active_document=True)
    return pipeline.apply_scheme(scheme)
