"""VDI CAD — Init.py（FreeCAD 启动时加载，不依赖 __file__）"""


def _vdi_cad_init_py():
    import os
    import sys
    import traceback

    import FreeCAD as App

    mod_dir = os.path.join(App.getUserAppDataDir(), "Mod", "VDI_CAD")
    log_path = os.path.join(mod_dir, "initgui_log.txt")

    def log(msg):
        try:
            App.Console.PrintMessage("[VDI-CAD] " + msg + "\n")
        except Exception:
            pass
        try:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write("[Init.py] " + msg + "\n")
        except Exception:
            pass

    if not os.path.isdir(mod_dir):
        return

    if mod_dir not in sys.path:
        sys.path.insert(0, mod_dir)

    try:
        import rpc_server
        rpc_server.start_server()
        log("RPC server started on 0.0.0.0:9876")
    except Exception:
        log("Init.py RPC FAILED:\n" + traceback.format_exc())


_vdi_cad_init_py()
