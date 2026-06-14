"""
vdi-knowledge MCP 桥接模块

职责：将 cad-intelligence 的规范知识查询请求转发到 vdi-knowledge MCP 服务器。
上层编排器（AIOrchestrator）在需要规范知识时，通过本模块构造 MCP 调用请求。
"""

import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# MCP 服务器默认路径
DEFAULT_MCP_SERVER = Path(__file__).parent.parent.parent.parent / \
    "pilotdeck-vdi" / "mcp" / "vdi-knowledge" / "server-v2.mjs"


class VDIKnowledgeBridge:
    """vdi-knowledge MCP 桥接器"""

    def __init__(self, mcp_server_path: Optional[str] = None):
        self._server_path = Path(mcp_server_path) if mcp_server_path else DEFAULT_MCP_SERVER
        self._available: Optional[bool] = None

    def is_available(self) -> bool:
        """检查 vdi-knowledge MCP 是否可用"""
        if self._available is None:
            self._available = self._server_path.exists()
            if not self._available:
                logger.warning(f"vdi-knowledge MCP 服务器不存在: {self._server_path}")
        return self._available

    def search_knowledge(self, query: str, discipline: str = "", limit: int = 10) -> Dict:
        """搜索规范条文

        Args:
            query: 搜索关键词
            discipline: 专业过滤（process/water/instrument/piping 等）
            limit: 返回条数

        Returns:
            {"results": [...], "count": int, "source": "vdi-knowledge"}
        """
        return self._call_tool("vdi_search_knowledge", {
            "query": query,
            "discipline": discipline,
            "limit": limit
        })

    def get_citation(self, clause_id: str) -> Dict:
        """获取单条规范原文"""
        return self._call_tool("vdi_get_citation", {
            "clause_id": clause_id
        })

    def search_by_entity(self, entity: str, clause_number: str = "") -> Dict:
        """按规范号/条款号精确查找"""
        return self._call_tool("vdi_search_by_entity", {
            "entity": entity,
            "clause_number": clause_number
        })

    def search_formulas(self, query: str) -> Dict:
        """搜索公式"""
        return self._call_tool("vdi_search_formulas", {
            "query": query
        })

    def get_formula(self, formula_id: str) -> Dict:
        """获取公式详情"""
        return self._call_tool("vdi_get_formula", {
            "formula_id": formula_id
        })

    def _call_tool(self, tool_name: str, arguments: Dict) -> Dict:
        """调用 MCP 工具

        当前实现：构造 MCP 请求描述，由上层通过 MCP 协议执行。
        未来可改为直接 stdio 调用 MCP 服务器。
        """
        if not self.is_available():
            return {
                "source": "vdi-knowledge",
                "available": False,
                "tool": tool_name,
                "arguments": arguments,
                "error": "vdi-knowledge MCP 服务器不可用"
            }

        # 返回调用描述，由上层通过 MCP 客户端执行
        return {
            "source": "vdi-knowledge",
            "available": True,
            "tool": tool_name,
            "arguments": arguments,
            "server": str(self._server_path),
            "hint": "请通过 MCP 客户端调用此工具"
        }

    def call_tool_via_mcp(self, tool_name: str, arguments: Dict,
                          mcp_caller=None) -> Dict:
        """通过 MCP 调用工具（需要上层注入 MCP 调用函数）

        Args:
            tool_name: 工具名称
            arguments: 工具参数
            mcp_caller: MCP 调用函数，签名 caller(server, tool, args) -> result
        """
        if mcp_caller is None:
            return self._call_tool(tool_name, arguments)

        try:
            result = mcp_caller("vdi-knowledge", tool_name, arguments)
            return {
                "available": True,
                "tool": tool_name,
                "result": result
            }
        except Exception as e:
            logger.error(f"MCP 调用失败 {tool_name}: {e}")
            return {
                "available": False,
                "tool": tool_name,
                "error": str(e)
            }


# 全局单例
_bridge: Optional[VDIKnowledgeBridge] = None


def get_vdi_bridge() -> VDIKnowledgeBridge:
    """获取全局 vdi-knowledge 桥接器"""
    global _bridge
    if _bridge is None:
        _bridge = VDIKnowledgeBridge()
    return _bridge
