"""
知识子系统

职责分离架构：
- KnowledgeGraph：绘图专用元数据（符号映射、默认参数、设备→工艺映射）
- VDIKnowledgeBridge：规范知识查询（委托 vdi-knowledge MCP）
"""

from .knowledge_graph import KnowledgeGraph, get_knowledge_graph
from .vdi_bridge import VDIKnowledgeBridge, get_vdi_bridge

__all__ = [
    "KnowledgeGraph", "get_knowledge_graph",
    "VDIKnowledgeBridge", "get_vdi_bridge",
]
