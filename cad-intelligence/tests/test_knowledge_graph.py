"""
知识图谱 V2 单元测试 — 职责分离架构

验证：
  1. 本地 JSON 加载（设备/工艺/仪表元数据）
  2. 设备类型查询（符号映射、默认参数、位号前缀）
  3. 工艺映射查询
  4. 规范知识委托 vdi-knowledge MCP
  5. vdi-knowledge 桥接器
"""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.knowledge.knowledge_graph import KnowledgeGraph, get_knowledge_graph
from core.knowledge.vdi_bridge import VDIKnowledgeBridge, get_vdi_bridge


class TestKnowledgeGraphV2:
    """知识图谱 V2 测试"""

    @pytest.fixture
    def kg(self):
        return KnowledgeGraph()

    # --- 加载 ---

    def test_load_from_json(self, kg):
        """从 JSON 文件加载成功"""
        stats = kg.get_statistics()
        assert stats["loaded"] is True
        assert stats["equipment_types"] > 0
        assert stats["process_types"] > 0
        assert stats["instrument_types"] > 0
        print(f"加载: {stats}")

    def test_global_instance(self):
        """全局单例"""
        kg = get_knowledge_graph()
        assert kg.get_statistics()["loaded"] is True

    # --- 设备查询 ---

    def test_get_equipment_types(self, kg):
        """获取所有设备类型"""
        types = kg.get_equipment_types()
        assert "pump" in types
        assert "valve" in types
        assert "heat_exchanger" in types
        print(f"设备类型: {types}")

    def test_get_equipment_info(self, kg):
        """获取设备元数据"""
        info = kg.get_equipment_info("pump")
        assert info is not None
        assert info["name"] == "泵"
        assert "sub_types" in info
        assert "symbol_mapping" in info
        print(f"泵信息: {info['name']}, 子类型: {info['sub_types']}")

    def test_get_equipment_info_not_found(self, kg):
        """查询不存在的设备"""
        info = kg.get_equipment_info("not_exist")
        assert info is None

    def test_get_symbol_id(self, kg):
        """获取符号 ID"""
        # 默认
        sid = kg.get_symbol_id("pump")
        assert sid is not None
        print(f"泵默认符号: {sid}")

        # 指定子类型
        sid = kg.get_symbol_id("pump", "centrifugal")
        assert sid == "PUMP-CENTRIFUGAL-001"

        sid = kg.get_symbol_id("valve", "ball")
        assert sid == "VALVE-BALL-001"

    def test_get_default_params(self, kg):
        """获取默认参数"""
        params = kg.get_default_params("pump")
        assert "diameter" in params
        assert "flow_rate" in params
        print(f"泵默认参数: {params}")

    def test_get_tag_prefix(self, kg):
        """获取位号前缀"""
        assert kg.get_tag_prefix("pump") == "P"
        assert kg.get_tag_prefix("valve") == "V"
        assert kg.get_tag_prefix("column") == "C"
        assert kg.get_tag_prefix("compressor") == "K"

    # --- 工艺查询 ---

    def test_get_process_info(self, kg):
        """获取工艺映射"""
        info = kg.get_process_info("reaction")
        assert info is not None
        assert "reactor" in info["typical_equipment"]
        assert "TI" in info["typical_instruments"]
        print(f"反应工艺: 设备={info['typical_equipment']}, 仪表={info['typical_instruments']}")

    def test_get_process_info_not_found(self, kg):
        """查询不存在的工艺"""
        info = kg.get_process_info("not_exist")
        assert info is None

    # --- 仪表查询 ---

    def test_get_instrument_info(self, kg):
        """获取仪表类型信息"""
        info = kg.get_instrument_info("TI")
        assert info is not None
        assert info["name"] == "温度指示"
        assert info["symbol"] == "INST-TI-001"
        print(f"TI 仪表: {info}")

    def test_get_instrument_info_not_found(self, kg):
        """查询不存在的仪表"""
        info = kg.get_instrument_info("XX")
        assert info is None

    # --- 规范知识委托 ---

    def test_query_standard_returns_mcp_intent(self, kg):
        """规范查询委托 VDIKnowledgeBridge（不直接查询本地）"""
        result = kg.query_standard("API 610")
        assert result["source"] == "vdi-knowledge"
        assert result["tool"] == "vdi_search_knowledge"
        assert "arguments" in result
        assert result["arguments"]["query"] == "API 610"
        print(f"规范查询委托: {result}")

    # --- 统计 ---

    def test_statistics(self, kg):
        """统计信息"""
        stats = kg.get_statistics()
        assert stats["loaded"] is True
        assert stats["standard_knowledge_source"] == "vdi-knowledge MCP (外部)"
        print(f"统计: {stats}")

    def test_repr(self, kg):
        """字符串表示"""
        r = repr(kg)
        assert "KnowledgeGraph" in r
        assert "equipment=" in r


class TestVDIKnowledgeBridge:
    """vdi-knowledge MCP 桥接器测试"""

    @pytest.fixture
    def bridge(self):
        return VDIKnowledgeBridge()

    def test_is_available(self, bridge):
        """检查 MCP 服务器文件是否存在"""
        available = bridge.is_available()
        print(f"vdi-knowledge MCP 可用: {available}")
        # 不强制要求存在，仅验证不报错

    def test_search_knowledge(self, bridge):
        """搜索规范条文"""
        result = bridge.search_knowledge("泵", discipline="process")
        assert "tool" in result
        assert result["tool"] == "vdi_search_knowledge"
        print(f"规范搜索: {result}")

    def test_get_formula(self, bridge):
        """获取公式"""
        result = bridge.get_formula("F-test-001")
        assert "tool" in result
        print(f"公式查询: {result}")

    def test_global_instance(self):
        """全局单例"""
        bridge = get_vdi_bridge()
        assert bridge is not None


class TestKnowledgeIntegration:
    """集成测试：KnowledgeGraph + VDIBridge"""

    def test_equipment_to_symbol_flow(self):
        """设备类型 → 符号 ID 完整流程"""
        kg = get_knowledge_graph()

        # 用户说"画一个离心泵"
        eq_info = kg.get_equipment_info("pump")
        assert eq_info is not None

        symbol_id = kg.get_symbol_id("pump", "centrifugal")
        assert symbol_id == "PUMP-CENTRIFUGAL-001"

        default_params = kg.get_default_params("pump")
        assert default_params["diameter"] == 40

        tag = f"{kg.get_tag_prefix('pump')}-1001"
        assert tag == "P-1001"

        print(f"完整流程: 泵 → {symbol_id}, 位号={tag}, 参数={default_params}")

    def test_process_to_equipment_flow(self):
        """工艺类型 → 典型设备 → 符号 ID 流程"""
        kg = get_knowledge_graph()

        proc = kg.get_process_info("heat_exchange")
        assert proc is not None

        for eq_type in proc["typical_equipment"]:
            sid = kg.get_symbol_id(eq_type)
            print(f"  换热工艺典型设备: {eq_type} → {sid}")

    def test_no_standard_overlap(self):
        """验证不再硬编码标准知识，委托 vdi-knowledge"""
        kg = get_knowledge_graph()
        stats = kg.get_statistics()

        # 标准知识来源应为外部 MCP
        assert "vdi-knowledge" in stats["standard_knowledge_source"]

        # 查询规范应委托 VDIKnowledgeBridge
        result = kg.query_standard("GB/T 150")
        assert result["source"] == "vdi-knowledge"
        assert result["tool"] == "vdi_search_knowledge"
        assert result["arguments"]["query"] == "GB/T 150"

        # KnowledgeGraph 本身不存储任何规范条文
        assert not hasattr(kg, "_standards_db") or not kg._standards_db if hasattr(kg, "_standards_db") else True

        print("标准知识已委托 vdi-knowledge MCP，无重叠")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
