"""
约束验证器单元测试
"""

import pytest
import sys
from pathlib import Path

# 添加模块路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.constraint_validator import ConstraintValidator, ValidationResult, validate_scheme


class TestValidationResult:
    """验证结果测试类"""
    
    def test_initial_state(self):
        """测试初始状态"""
        result = ValidationResult()
        assert result.is_valid == True
        assert len(result.errors) == 0
        assert len(result.warnings) == 0
        assert len(result.suggestions) == 0
    
    def test_add_error(self):
        """测试添加错误"""
        result = ValidationResult()
        result.add_error("测试错误")
        
        assert result.is_valid == False
        assert len(result.errors) == 1
        assert result.errors[0] == "测试错误"
    
    def test_add_warning(self):
        """测试添加警告"""
        result = ValidationResult()
        result.add_warning("测试警告")
        
        assert result.is_valid == True  # 警告不影响有效性
        assert len(result.warnings) == 1
    
    def test_add_suggestion(self):
        """测试添加建议"""
        result = ValidationResult()
        result.add_suggestion("测试建议")
        
        assert result.is_valid == True
        assert len(result.suggestions) == 1
    
    def test_to_dict(self):
        """测试转换为字典"""
        result = ValidationResult()
        result.add_error("错误1")
        result.add_warning("警告1")
        
        d = result.to_dict()
        assert d["is_valid"] == False
        assert len(d["errors"]) == 1
        assert len(d["warnings"]) == 1


class TestConstraintValidator:
    """约束验证器测试类"""
    
    @pytest.fixture
    def validator(self):
        """创建验证器实例"""
        return ConstraintValidator()
    
    @pytest.fixture
    def valid_scheme(self):
        """创建有效的设计方案"""
        return {
            "input_type": "scheme",
            "project_info": {
                "project_id": "PRJ-001",
                "drawing_number": "PFD-001"
            },
            "geometry": {
                "objects": [
                    {"id": "EQ-001", "label": "P-1001", "ai_type": "pump", "position": {"x": 100, "y": 200}},
                    {"id": "EQ-002", "label": "T-1001", "ai_type": "tank", "position": {"x": 300, "y": 200}}
                ],
                "connections": [
                    {"id": "CONN-001", "from": "EQ-001", "to": "EQ-002", "type": "pipe", "label": "1001-A1A-H"}
                ]
            },
            "streams": [
                {"stream_no": "S-101", "flow": "100 m³/h", "T_C": 80, "P_MPa": 0.6}
            ],
            "output_config": {
                "drawing_type": "pfd"
            }
        }
    
    def test_valid_scheme(self, validator, valid_scheme):
        """测试有效方案"""
        result = validator.validate(valid_scheme)
        assert result.is_valid == True
        assert len(result.errors) == 0
        print(f"有效方案验证通过，警告数: {len(result.warnings)}")
    
    def test_missing_required_fields(self, validator):
        """测试缺少必需字段"""
        scheme = {"input_type": "scheme"}
        result = validator.validate(scheme)
        
        assert result.is_valid == False
        assert any("project_info" in e for e in result.errors)
        assert any("geometry" in e for e in result.errors)
        assert any("output_config" in e for e in result.errors)
        print(f"缺少字段错误: {result.errors}")
    
    def test_duplicate_tags(self, validator, valid_scheme):
        """测试重复标签"""
        # 添加重复标签的设备
        valid_scheme["geometry"]["objects"].append(
            {"id": "EQ-003", "label": "P-1001", "ai_type": "pump", "position": {"x": 200, "y": 300}}
        )
        
        result = validator.validate(valid_scheme)
        assert result.is_valid == False
        assert any("重复" in e for e in result.errors)
        print(f"重复标签错误: {result.errors}")
    
    def test_invalid_connection(self, validator, valid_scheme):
        """测试无效连接"""
        # 添加引用不存在设备的连接
        valid_scheme["geometry"]["connections"].append(
            {"id": "CONN-002", "from": "EQ-001", "to": "EQ-999", "type": "pipe"}
        )
        
        result = validator.validate(valid_scheme)
        assert result.is_valid == False
        assert any("不存在" in e for e in result.errors)
        print(f"无效连接错误: {result.errors}")
    
    def test_self_connection(self, validator, valid_scheme):
        """测试自连接"""
        valid_scheme["geometry"]["connections"].append(
            {"id": "CONN-002", "from": "EQ-001", "to": "EQ-001", "type": "pipe"}
        )
        
        result = validator.validate(valid_scheme)
        assert result.is_valid == False
        assert any("自连接" in e for e in result.errors)
        print(f"自连接错误: {result.errors}")
    
    def test_invalid_temperature(self, validator, valid_scheme):
        """测试无效温度"""
        valid_scheme["streams"][0]["T_C"] = -300  # 低于绝对零度
        
        result = validator.validate(valid_scheme)
        assert result.is_valid == False
        assert any("绝对零度" in e for e in result.errors)
        print(f"无效温度错误: {result.errors}")
    
    def test_invalid_pressure(self, validator, valid_scheme):
        """测试无效压力"""
        valid_scheme["streams"][0]["P_MPa"] = -1  # 负压力
        
        result = validator.validate(valid_scheme)
        assert result.is_valid == False
        assert any("负值" in e for e in result.errors)
        print(f"无效压力错误: {result.errors}")
    
    def test_missing_drawing_type(self, validator, valid_scheme):
        """测试缺少图纸类型"""
        del valid_scheme["output_config"]["drawing_type"]
        
        result = validator.validate(valid_scheme)
        assert result.is_valid == False
        assert any("drawing_type" in e for e in result.errors)
        print(f"缺少图纸类型错误: {result.errors}")
    
    def test_strict_mode(self, valid_scheme):
        """测试严格模式"""
        validator = ConstraintValidator(strict_mode=True)
        
        # 移除流体参数
        valid_scheme["streams"][0]["flow"] = None
        
        result = validator.validate(valid_scheme)
        assert result.is_valid == False  # 严格模式下缺少参数是错误
        print(f"严格模式错误: {result.errors}")


class TestValidateSchemeFunction:
    """测试便捷函数"""
    
    def test_validate_scheme_function(self):
        """测试 validate_scheme 函数"""
        scheme = {
            "input_type": "scheme",
            "project_info": {"drawing_number": "PFD-001"},
            "geometry": {
                "objects": [
                    {"id": "EQ-001", "label": "P-1001", "position": {"x": 100, "y": 200}}
                ],
                "connections": []
            },
            "output_config": {"drawing_type": "pfd"}
        }
        
        result = validate_scheme(scheme)
        assert isinstance(result, ValidationResult)
        print(f"便捷函数验证结果: is_valid={result.is_valid}")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
