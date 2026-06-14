"""
符号管理器单元测试
"""

import pytest
import sys
from pathlib import Path

# 添加模块路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.symbol_manager import SymbolManager, get_symbol_manager


class TestSymbolManager:
    """符号管理器测试类"""
    
    @pytest.fixture
    def symbol_manager(self):
        """创建符号管理器实例"""
        return SymbolManager()
    
    def test_load_symbols(self, symbol_manager):
        """测试符号加载"""
        count = symbol_manager.get_symbol_count()
        assert count > 0, f"应该加载到符号，实际加载 {count} 个"
        print(f"已加载 {count} 个符号")
    
    def test_get_symbol(self, symbol_manager):
        """测试获取符号"""
        # 测试存在的符号
        symbol = symbol_manager.get_symbol("PUMP-CENTRIFUGAL-001")
        assert symbol is not None
        assert symbol["symbol_id"] == "PUMP-CENTRIFUGAL-001"
        assert symbol["name"] == "离心泵"
        
        # 测试不存在的符号
        symbol = symbol_manager.get_symbol("NOT-EXIST")
        assert symbol is None
    
    def test_get_categories(self, symbol_manager):
        """测试获取类别"""
        categories = symbol_manager.get_categories()
        assert len(categories) > 0
        assert "pumps" in categories or "equipment" in categories
        print(f"类别: {categories}")
    
    def test_get_symbols_by_category(self, symbol_manager):
        """测试按类别获取符号"""
        # 获取泵类符号
        pump_symbols = symbol_manager.get_symbols_by_category("pumps")
        assert len(pump_symbols) > 0
        
        for symbol in pump_symbols:
            assert symbol["category"] == "pumps"
            print(f"  - {symbol['symbol_id']}: {symbol['name']}")
    
    def test_search_symbols(self, symbol_manager):
        """测试搜索符号"""
        # 搜索中文关键词
        results = symbol_manager.search_symbols("泵")
        assert len(results) > 0
        print(f"搜索'泵'结果: {len(results)} 个")
        
        # 搜索英文关键词
        results = symbol_manager.search_symbols("pump")
        assert len(results) > 0
        print(f"搜索'pump'结果: {len(results)} 个")
        
        # 搜索标准号
        results = symbol_manager.search_symbols("ISA")
        assert len(results) > 0
        print(f"搜索'ISA'结果: {len(results)} 个")
    
    def test_get_symbol_count(self, symbol_manager):
        """测试获取符号数量"""
        count = symbol_manager.get_symbol_count()
        assert count >= 45, f"符号数量应>=45，实际 {count}"
        print(f"符号总数: {count}")
    
    def test_get_category_count(self, symbol_manager):
        """测试获取类别数量"""
        category_count = symbol_manager.get_category_count()
        assert len(category_count) > 0
        
        total = sum(category_count.values())
        print(f"类别分布: {category_count}")
        print(f"符号总数: {total}")
    
    def test_reload(self, symbol_manager):
        """测试重新加载"""
        original_count = symbol_manager.get_symbol_count()
        symbol_manager.reload()
        new_count = symbol_manager.get_symbol_count()
        
        assert new_count == original_count
        print(f"重新加载成功: {new_count} 个符号")
    
    def test_global_instance(self):
        """测试全局实例"""
        manager = get_symbol_manager()
        assert manager is not None
        assert manager.get_symbol_count() > 0


class TestSymbolFormat:
    """符号格式测试类"""
    
    @pytest.fixture
    def symbol_manager(self):
        """创建符号管理器实例"""
        return SymbolManager()
    
    def test_symbol_structure(self, symbol_manager):
        """测试符号结构"""
        for symbol_id, symbol in symbol_manager.get_all_symbols().items():
            # 检查必需字段
            assert "symbol_id" in symbol, f"{symbol_id} 缺少 symbol_id"
            assert "name" in symbol, f"{symbol_id} 缺少 name"
            assert "category" in symbol, f"{symbol_id} 缺少 category"
            assert "geometry" in symbol, f"{symbol_id} 缺少 geometry"
            
            # 检查 geometry 结构
            geometry = symbol["geometry"]
            assert "components" in geometry, f"{symbol_id} 的 geometry 缺少 components"
            
            # 检查 components
            components = geometry["components"]
            assert isinstance(components, list), f"{symbol_id} 的 components 应该是列表"
            assert len(components) > 0, f"{symbol_id} 的 components 为空"
    
    def test_symbol_connections(self, symbol_manager):
        """测试符号连接定义"""
        for symbol_id, symbol in symbol_manager.get_all_symbols().items():
            if "connections" in symbol:
                connections = symbol["connections"]
                assert isinstance(connections, dict), f"{symbol_id} 的 connections 应该是字典"
                
                for conn_name, conn_def in connections.items():
                    assert "position" in conn_def, f"{symbol_id}.{conn_name} 缺少 position"
                    pos = conn_def["position"]
                    assert "x" in pos and "y" in pos, f"{symbol_id}.{conn_name} 的 position 格式错误"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
