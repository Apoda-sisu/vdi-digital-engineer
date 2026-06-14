"""轻量命令注册 — 确保 Gui.addCommand 在 FreeCAD 启动时执行"""

import os
import sys
import traceback

import FreeCAD
import FreeCADGui as Gui

from cad_paths import ICON_PATH, setup_sys_path

setup_sys_path()

module_path = os.path.dirname(os.path.abspath(__file__))
_COMMANDS_REGISTERED = False


def register_commands():
    """注册所有 CadIntelligence 命令（可重复调用，已注册则跳过）"""
    global _COMMANDS_REGISTERED

    existing = set(Gui.listCommands())
    if "CadIntelligence_ShowPanel" in existing:
        _COMMANDS_REGISTERED = True
        return True

    try:
        from qt_compat import import_qt
        QtGui, QtCore = import_qt()
    except Exception as e:
        FreeCAD.Console.PrintError(f"CadIntelligence qt_compat 失败: {e}\n")
        traceback.print_exc()
        return False

    pixmap = ICON_PATH if os.path.isfile(ICON_PATH) else ""

    class CadIntelligenceShowPanel:
        def GetResources(self):
            return {
                "Pixmap": pixmap,
                "MenuText": "显示控制面板",
                "ToolTip": "打开 CAD Intelligence AI 绘图控制面板",
            }

        def Activated(self):
            try:
                import CadIntelligenceCommands as cic
                cic.show_panel_dialog()
            except Exception as ex:
                FreeCAD.Console.PrintError(f"打开面板失败: {ex}\n")
                traceback.print_exc()

        def IsActive(self):
            return True

    class CadIntelligenceGenerateFromJSON:
        def GetResources(self):
            return {
                "Pixmap": pixmap,
                "MenuText": "从JSON生成图纸",
                "ToolTip": "从JSON文件生成工程图",
            }

        def Activated(self):
            import CadIntelligenceCommands as cic
            cic.CadIntelligenceGenerateFromJSON().Activated()

        def IsActive(self):
            return True

    class CadIntelligenceShowSymbols:
        def GetResources(self):
            return {
                "Pixmap": pixmap,
                "MenuText": "符号库浏览",
                "ToolTip": "查看国家标准符号库",
            }

        def Activated(self):
            import CadIntelligenceCommands as cic
            cic.CadIntelligenceShowSymbols().Activated()

        def IsActive(self):
            return True

    class CadIntelligenceExportDrawing:
        def GetResources(self):
            return {
                "Pixmap": pixmap,
                "MenuText": "导出图纸",
                "ToolTip": "导出当前图纸",
            }

        def Activated(self):
            import CadIntelligenceCommands as cic
            cic.CadIntelligenceExportDrawing().Activated()

        def IsActive(self):
            return True

    class CadIntelligenceSettings:
        def GetResources(self):
            return {
                "Pixmap": pixmap,
                "MenuText": "设置",
                "ToolTip": "配置 CAD Intelligence",
            }

        def Activated(self):
            import CadIntelligenceCommands as cic
            cic.CadIntelligenceSettings().Activated()

        def IsActive(self):
            return True

    try:
        Gui.addCommand("CadIntelligence_ShowPanel", CadIntelligenceShowPanel())
        Gui.addCommand("CadIntelligence_GenerateFromJSON", CadIntelligenceGenerateFromJSON())
        Gui.addCommand("CadIntelligence_ShowSymbols", CadIntelligenceShowSymbols())
        Gui.addCommand("CadIntelligence_ExportDrawing", CadIntelligenceExportDrawing())
        Gui.addCommand("CadIntelligence_Settings", CadIntelligenceSettings())
        _COMMANDS_REGISTERED = True
        FreeCAD.Console.PrintMessage("CadIntelligence: 5 个命令已注册。\n")
        return True
    except Exception as e:
        FreeCAD.Console.PrintError(f"CadIntelligence 命令注册失败: {e}\n")
        traceback.print_exc()
        return False
