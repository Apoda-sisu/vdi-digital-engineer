"""VDI CAD Addon — GUI init.

FreeCAD 用 exec() 执行本文件：不能使用 __file__，须用 App.getUserAppDataDir()。
"""


def _vdi_cad_init():
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
                f.write(msg + "\n")
        except Exception:
            pass

    try:
        with open(log_path, "w", encoding="utf-8") as f:
            f.write("InitGui start: " + mod_dir + "\n")
    except Exception:
        pass

    if not os.path.isdir(mod_dir):
        log("Mod 目录不存在: " + mod_dir)
        return

    if mod_dir not in sys.path:
        sys.path.insert(0, mod_dir)

    log("sys.path ready, mod_dir exists=True")

    try:
        from engine.font_compat import apply_macos_font_compat

        apply_macos_font_compat()
        log("font compat applied (macOS TechDraw Sans warning)")
    except Exception:
        log("font compat skipped:\n" + traceback.format_exc())

    try:
        import vdi_workbench
        vdi_workbench.register()
        log("workbench registered")
    except Exception:
        log("workbench FAILED:\n" + traceback.format_exc())

    try:
        import rpc_server
        rpc_server.start_server()
        log("RPC server started on 0.0.0.0:9876 (Docker via host.docker.internal)")
    except Exception:
        log("RPC server FAILED:\n" + traceback.format_exc())

    try:
        from gui.selection_observer import register_vdi_selection
        reg = register_vdi_selection(pick_mode="techdraw", enabled=True)
        log("VDI selection observer: " + str(reg.get("status", "ok")))
    except Exception:
        log("VDI selection observer FAILED:\n" + traceback.format_exc())


_vdi_cad_init()
