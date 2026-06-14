"""VDI CAD 工作台 — 确保 FreeCAD 1.x 加载 InitGui 并注册模块。"""

import traceback

import FreeCAD as App
import FreeCADGui as Gui


class VdiCadWorkbench(Gui.Workbench):
    MenuText = "VDI CAD"
    ToolTip = "VDI CAD RPC — DisciplineOutput 驱动 FreeCAD 绘图"
    Icon = ""

    def Initialize(self):
        App.Console.PrintMessage("VDI CAD workbench initialized.\n")

    def Activated(self):
        pass

    def Deactivated(self):
        pass

    def GetClassName(self):
        return "Gui::PythonWorkbench"


def register():
    try:
        Gui.addWorkbench(VdiCadWorkbench())
        App.Console.PrintMessage("VDI CAD: workbench registered.\n")
    except KeyError:
        App.Console.PrintMessage("VDI CAD: workbench already exists.\n")
    except Exception:
        traceback.print_exc()
        App.Console.PrintError("VDI CAD: workbench registration FAILED.\n")
