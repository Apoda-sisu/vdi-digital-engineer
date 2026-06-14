"""
工程知识图谱 V2 — 职责分离架构

职责划分：
  - 本模块：绘图专用元数据（符号映射、默认参数、设备→工艺映射）
  - vdi-knowledge MCP：权威规范知识（651条规范条文、162条公式、参数表）

数据来源：
  - cad_equipment_knowledge.json：设备/仪表/工艺映射
  - 符号库 symbols/：符号几何定义
  - vdi-knowledge MCP：规范条文、公式（运行时调用）
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


class KnowledgeGraph:
    """工程知识图谱 V2 — 绘图专用元数据 + vdi-knowledge MCP 调用"""

    def __init__(self, data_dir: Optional[str] = None):
        self._data_dir = Path(data_dir) if data_dir else Path(__file__).parent
        self._equipment_db: Dict[str, Dict] = {}
        self._process_map: Dict[str, Dict] = {}
        self._instrument_types: Dict[str, Dict] = {}
        self._loaded = False

        self._load_cad_knowledge()

    # ------------------------------------------------------------------
    # 数据加载
    # ------------------------------------------------------------------

    def _load_cad_knowledge(self):
        """从 JSON 文件加载绘图专用元数据"""
        json_path = self._data_dir / "cad_equipment_knowledge.json"
        if not json_path.exists():
            logger.warning(f"知识文件不存在: {json_path}")
            return

        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            # 设备类型索引（以 id 为键）
            for eq in data.get("equipment_types", []):
                self._equipment_db[eq["id"]] = eq

            # 工艺→设备映射
            self._process_map = data.get("process_equipment_map", {})

            # 仪表类型
            self._instrument_types = data.get("instrument_types", {})

            self._loaded = True
            logger.info(
                f"已加载绘图知识: {len(self._equipment_db)} 种设备, "
                f"{len(self._process_map)} 种工艺, "
                f"{len(self._instrument_types)} 种仪表"
            )
        except Exception as e:
            logger.error(f"加载知识文件失败: {e}")

    # ------------------------------------------------------------------
    # 设备知识查询（本地）
    # ------------------------------------------------------------------

    def get_equipment_types(self) -> List[str]:
        """返回所有支持的设备类型 ID"""
        return list(self._equipment_db.keys())

    def get_equipment_info(self, eq_type: str) -> Optional[Dict]:
        """获取设备元数据（符号映射、默认参数等）"""
        return self._equipment_db.get(eq_type)

    def get_symbol_id(self, eq_type: str, sub_type: Optional[str] = None) -> Optional[str]:
        """获取设备对应的符号 ID"""
        eq = self._equipment_db.get(eq_type)
        if not eq:
            return None
        mapping = eq.get("symbol_mapping", {})
        if sub_type and sub_type in mapping:
            return mapping[sub_type]
        # 回退到第一个
        if mapping:
            return next(iter(mapping.values()))
        return None

    def get_default_params(self, eq_type: str) -> Dict:
        """获取设备默认参数"""
        eq = self._equipment_db.get(eq_type)
        return eq.get("default_params", {}) if eq else {}

    def get_tag_prefix(self, eq_type: str) -> str:
        """获取设备位号前缀（如泵=P，阀=V）"""
        eq = self._equipment_db.get(eq_type)
        return eq.get("tag_prefix", "EQ") if eq else "EQ"

    # ------------------------------------------------------------------
    # 工艺知识查询（本地）
    # ------------------------------------------------------------------

    def get_process_info(self, process_type: str) -> Optional[Dict]:
        """获取工艺类型对应的典型设备和仪表"""
        return self._process_map.get(process_type)

    def get_instrument_info(self, inst_type: str) -> Optional[Dict]:
        """获取仪表类型信息"""
        return self._instrument_types.get(inst_type)

    # ------------------------------------------------------------------
    # 规范知识查询（委托 VDIKnowledgeBridge）
    # ------------------------------------------------------------------

    def query_standard(self, keyword: str, discipline: Optional[str] = None) -> Dict:
        """查询规范条文 — 委托 vdi-knowledge MCP

        便捷方法，内部调用 VDIKnowledgeBridge。
        返回格式见 VDIKnowledgeBridge.search_knowledge。
        """
        from .vdi_bridge import get_vdi_bridge
        return get_vdi_bridge().search_knowledge(keyword, discipline=discipline or "")

    def get_formula(self, formula_id: str) -> Dict:
        """获取公式详情 — 委托 vdi-knowledge MCP"""
        from .vdi_bridge import get_vdi_bridge
        return get_vdi_bridge().get_formula(formula_id)

    def search_formulas(self, keyword: str) -> Dict:
        """搜索公式 — 委托 vdi-knowledge MCP"""
        from .vdi_bridge import get_vdi_bridge
        return get_vdi_bridge().search_formulas(keyword)

    # ------------------------------------------------------------------
    # 统计与导出
    # ------------------------------------------------------------------

    def get_statistics(self) -> Dict:
        """获取统计信息"""
        return {
            "loaded": self._loaded,
            "equipment_types": len(self._equipment_db),
            "process_types": len(self._process_map),
            "instrument_types": len(self._instrument_types),
            "data_source": str(self._data_dir / "cad_equipment_knowledge.json"),
            "standard_knowledge_source": "vdi-knowledge MCP (外部)"
        }

    def __repr__(self) -> str:
        return (
            f"KnowledgeGraph(equipment={len(self._equipment_db)}, "
            f"process={len(self._process_map)}, "
            f"instrument={len(self._instrument_types)})"
        )


# 全局单例
_knowledge_graph: Optional[KnowledgeGraph] = None


def get_knowledge_graph() -> KnowledgeGraph:
    """获取全局知识图谱实例"""
    global _knowledge_graph
    if _knowledge_graph is None:
        _knowledge_graph = KnowledgeGraph()
    return _knowledge_graph
