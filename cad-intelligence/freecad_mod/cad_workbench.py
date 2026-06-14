"""CadIntelligence 工作台定义 — 必须作为模块 import（不能放在 InitGui.py 里，
因为 FreeCAD 用 exec 执行 InitGui.py，类体无法访问模块级变量）"""

import os
import traceback

import FreeCAD as App
import FreeCADGui as Gui

MOD_DIR = os.path.dirname(os.path.abspath(__file__))
ICON = os.path.join(MOD_DIR, "Resources", "icons", "CadIntelligence.svg")
if not os.path.isfile(ICON):
    ICON = ""

COMMAND_LIST = [
    "CadIntelligence_ShowPanel",
    "CadIntelligence_GenerateFromJSON",
    "CadIntelligence_ShowSymbols",
    "CadIntelligence_ExportDrawing",
    "CadIntelligence_Settings",
]


class CadIntelligenceWorkbench(Gui.Workbench):
    MenuText = "AI 智能绘图"
    ToolTip = "AI 智能绘图工具 (CAD Intelligence)"
    Icon = ICON

    def GetIcon(self):
        return ICON

    def Initialize(self):
        self.commandList = list(COMMAND_LIST)
        try:
            import cad_commands
            cad_commands.register_commands()
            self.appendToolbar("智能绘图", self.commandList[:3])
            self.appendToolbar("导出与设置", self.commandList[3:])
            self.appendMenu("&AI 智能绘图", self.commandList)
            App.Console.PrintMessage("CadIntelligence workbench initialized.\n")
        except Exception:
            traceback.print_exc()
            App.Console.PrintError("CadIntelligence workbench init FAILED.\n")

    def Activated(self):
        try:
            import cad_commands
            cad_commands.register_commands()
        except Exception:
            traceback.print_exc()

    def Deactivated(self):
        pass

    def ContextMenu(self, recipient):
        if hasattr(self, "commandList"):
            self.appendContextMenu("CadIntelligence", self.commandList)

    def GetClassName(self):
        return "Gui::PythonWorkbench"


def register():
    """注册命令 + 工作台（可重复调用）"""
    try:
        import cad_commands
        cad_commands.register_commands()
    except Exception:
        traceback.print_exc()
        App.Console.PrintError("CadIntelligence: 命令注册失败（不阻断工作台）。\n")

    try:
        Gui.addWorkbench(CadIntelligenceWorkbench())
        App.Console.PrintMessage("CadIntelligence: workbench registered.\n")
    except KeyError:
        App.Console.PrintMessage("CadIntelligence: workbench already exists.\n")
