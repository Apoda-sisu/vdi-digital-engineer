"""FreeCAD init script of CadIntelligence module"""

import FreeCAD


def importJSON(filename):
    """JSON 方案导入占位（后续实现）"""
    import FreeCAD
    FreeCAD.Console.PrintMessage(f"CadIntelligence: import JSON {filename}\n")


def exportJSON(filename):
    """JSON 方案导出占位（后续实现）"""
    import FreeCAD
    FreeCAD.Console.PrintMessage(f"CadIntelligence: export JSON {filename}\n")


FreeCAD.addImportType("JSON scheme (*.json)", "importJSON")
FreeCAD.addExportType("JSON scheme (*.json)", "exportJSON")
FreeCAD.Console.PrintMessage("CadIntelligence module loaded!\n")
