"""
CAD Intelligence - 智能绘图模块 V2.0
基于FreeCAD的智能绘图模块，支持根据设计方案或自然语言自动生成工程图

主要功能：
- 2D PFD/P&ID 工程图生成
- 3D 参数化设备建模
- 设备布置图、等轴测图
- AI 自然语言绘图
- 智能布局与约束验证
- 工程知识图谱
"""

__version__ = "2.0.0"
__author__ = "VDI Digital Engineer Project"

# 使用绝对导入避免循环导入问题
try:
    from .core.geometry_engine import GeometryEngine
    from .core.drawing_pipeline import DrawingPipeline
    from .core.export_engine import ExportEngine
    from .core.ai_engine import AIEngine
    
    __all__ = ["GeometryEngine", "DrawingPipeline", "ExportEngine", "AIEngine"]
except ImportError:
    # 当作为独立模块运行时，相对导入可能失败
    __all__ = []