"""
几何建模引擎测试
"""

import pytest
import json
import sys
from pathlib import Path

# 添加项目根目录到Python路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.geometry_engine import GeometryEngine


class TestGeometryEngine:
    """几何建模引擎测试类"""
    
    @pytest.fixture
    def engine(self):
        """创建引擎实例"""
        return GeometryEngine()
    
    @pytest.fixture
    def sample_scheme_input(self):
        """示例scheme输入数据"""
        return {
            "input_type": "scheme",
            "project_info": {
                "project_id": "TEST-001",
                "project_name": "测试项目",
                "drawing_number": "PFD-TEST",
                "revision": "A"
            },
            "geometry": {
                "objects": [
                    {
                        "id": "EQ-001",
                        "type": "equipment",
                        "symbol_id": "PUMP-CENTRIFUGAL-001",
                        "position": {"x": 100, "y": 200},
                        "label": "P-1001"
                    },
                    {
                        "id": "EQ-002",
                        "type": "equipment",
                        "symbol_id": "VESSEL-TANK-001",
                        "position": {"x": 300, "y": 200},
                        "label": "T-1001"
                    }
                ],
                "connections": [
                    {
                        "id": "CONN-001",
                        "type": "pipe",
                        "from": "EQ-001",
                        "to": "EQ-002",
                        "label": "1001-A1A-H"
                    }
                ]
            },
            "annotations": {
                "dimensions": [],
                "labels": [],
                "notes": []
            },
            "output_config": {
                "format": "FCStd",
                "drawing_type": "pfd",
                "scale": "1:100",
                "dimension_standard": "GB"
            }
        }
    
    def test_engine_initialization(self, engine):
        """测试引擎初始化"""
        assert engine is not None
        assert engine.config is not None
    
    def test_generate_from_scheme(self, engine, sample_scheme_input):
        """测试从scheme生成图纸"""
        result = engine.generate(sample_scheme_input)
        
        assert result["status"] == "success"
        assert result["output_type"] == "2d_drawing"
        assert result["metadata"]["object_count"] == 2
        assert result["metadata"]["connection_count"] == 1
    
    def test_validate_input_valid(self, engine, sample_scheme_input):
        """测试有效输入验证"""
        geometry = sample_scheme_input["geometry"]
        # 不应抛出异常
        engine._validate_input(geometry)
    
    def test_validate_input_duplicate_ids(self, engine):
        """测试重复ID验证"""
        geometry = {
            "objects": [
                {"id": "EQ-001", "type": "equipment"},
                {"id": "EQ-001", "type": "equipment"}  # 重复ID
            ],
            "connections": []
        }
        
        with pytest.raises(ValueError, match="对象ID不唯一"):
            engine._validate_input(geometry)
    
    def test_validate_input_invalid_connection(self, engine):
        """测试无效连接验证"""
        geometry = {
            "objects": [
                {"id": "EQ-001", "type": "equipment"}
            ],
            "connections": [
                {"id": "CONN-001", "from": "EQ-001", "to": "EQ-999"}  # 不存在的对象
            ]
        }
        
        with pytest.raises(ValueError, match="连接引用的对象不存在"):
            engine._validate_input(geometry)
    
    def test_get_symbol(self, engine):
        """测试获取符号"""
        symbol = engine.get_symbol("PUMP-CENTRIFUGAL-001")
        assert symbol is not None
        assert symbol["symbol_id"] == "PUMP-CENTRIFUGAL-001"
        assert symbol["name"] == "离心泵"
    
    def test_get_symbol_not_found(self, engine):
        """测试获取不存在的符号"""
        symbol = engine.get_symbol("NON-EXISTENT")
        assert symbol is None
    
    def test_list_symbols(self, engine):
        """测试列出符号"""
        symbols = engine.list_symbols()
        assert len(symbols) > 0
    
    def test_list_symbols_by_category(self, engine):
        """测试按类别列出符号"""
        equipment_symbols = engine.list_symbols(category="equipment")
        assert len(equipment_symbols) > 0
        
        for symbol in equipment_symbols:
            assert symbol["category"] == "equipment"
    
    def test_create_primitive(self, engine):
        """测试创建基本几何体"""
        result = engine.create_primitive("box", {"length": 100, "width": 50, "height": 30})
        assert result is not None
        assert result["type"] == "box"
    
    def test_apply_boolean_operation(self, engine):
        """测试布尔运算"""
        shape1 = {"type": "box"}
        shape2 = {"type": "cylinder"}
        
        result = engine.apply_boolean_operation(shape1, shape2, "fuse")
        assert result is not None
        assert result["operation"] == "fuse"


class TestGeometryEngineWithFile:
    """使用文件的几何建模引擎测试"""
    
    def test_parse_json_file(self):
        """测试解析JSON文件"""
        from parsers.json_parser import JSONParser
        
        parser = JSONParser()
        
        # 创建临时测试文件
        test_data = {
            "input_type": "scheme",
            "project_info": {
                "project_id": "FILE-TEST",
                "project_name": "文件测试项目"
            },
            "geometry": {
                "objects": [],
                "connections": []
            }
        }
        
        test_file = Path("test_input.json")
        try:
            with open(test_file, 'w', encoding='utf-8') as f:
                json.dump(test_data, f, ensure_ascii=False)
            
            result = parser.parse(str(test_file))
            assert result["input_type"] == "scheme"
            assert result["project_info"]["project_id"] == "FILE-TEST"
        finally:
            if test_file.exists():
                test_file.unlink()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])