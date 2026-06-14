"""CadIntelligence GUI initialization

FreeCAD 用 exec(code, globals, locals) 执行本文件：模块级变量在 locals，
类体/函数体只能访问 globals —— 所以这里只允许一个自包含函数，
真正的工作台定义在 cad_workbench.py（正常 import 语义）。
"""


def _cadintelligence_init():
    import os
    import sys
    import traceback

    import FreeCAD as App

    mod_dir = os.path.join(App.getUserAppDataDir(), "Mod", "CadIntelligence")
    log_path = os.path.join(mod_dir, "initgui_log.txt")

    def log(msg):
        try:
            App.Console.PrintMessage("CadIntelligence: " + msg + "\n")
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
    pkg = os.path.join(mod_dir, "cad_intelligence")
    if os.path.isdir(pkg) and pkg not in sys.path:
        sys.path.insert(0, pkg)
    log("sys.path ready, cad_intelligence exists=" + str(os.path.isdir(pkg)))

    try:
        import cad_workbench
        cad_workbench.register()
        log("workbench + commands registered")
    except Exception:
        log("registration FAILED:\n" + traceback.format_exc())


_cadintelligence_init()
