"""
约束验证器 - 验证设计方案的正确性和合规性

支持的验证类型：
- 结构完整性验证
- 连接一致性验证
- 参数合理性验证
- 标准合规性验证
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """验证结果"""
    is_valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    suggestions: List[str] = field(default_factory=list)
    
    def add_error(self, message: str):
        """添加错误"""
        self.errors.append(message)
        self.is_valid = False
    
    def add_warning(self, message: str):
        """添加警告"""
        self.warnings.append(message)
    
    def add_suggestion(self, message: str):
        """添加建议"""
        self.suggestions.append(message)
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        return {
            "is_valid": self.is_valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "suggestions": self.suggestions
        }


class ConstraintValidator:
    """约束验证器"""
    
    # 设备类型定义
    EQUIPMENT_TYPES = {
        "pump", "valve", "vessel", "tank", "heat_exchanger", "exchanger",
        "reactor", "column", "compressor", "fan", "filter"
    }
    
    # 连接类型定义
    CONNECTION_TYPES = {"pipe", "duct", "cable"}
    
    # 必需的流体参数
    REQUIRED_STREAM_PARAMS = ["stream_no", "flow", "T_C", "P_MPa"]
    
    def __init__(self, strict_mode: bool = False):
        """
        初始化约束验证器
        
        Args:
            strict_mode: 严格模式，启用更严格的验证规则
        """
        self.strict_mode = strict_mode
    
    def validate(self, scheme: Dict) -> ValidationResult:
        """
        验证设计方案
        
        Args:
            scheme: 设计方案字典
            
        Returns:
            验证结果
        """
        result = ValidationResult()
        
        # 1. 基础结构验证
        self._validate_structure(scheme, result)
        
        # 2. 设备验证
        if "geometry" in scheme:
            self._validate_equipment(scheme["geometry"].get("objects", []), result)
            self._validate_connections(
                scheme["geometry"].get("connections", []),
                scheme["geometry"].get("objects", []),
                result
            )
        
        # 3. 流体参数验证
        if "streams" in scheme:
            self._validate_streams(scheme["streams"], result)
        
        # 4. 仪表验证
        if "geometry" in scheme and "instruments" in scheme["geometry"]:
            self._validate_instruments(
                scheme["geometry"]["instruments"],
                scheme["geometry"].get("connections", []),
                result
            )
        
        # 5. 输出配置验证
        if "output_config" in scheme:
            self._validate_output_config(scheme["output_config"], result)
        
        return result
    
    def _validate_structure(self, scheme: Dict, result: ValidationResult):
        """验证基础结构"""
        required_fields = ["input_type", "project_info", "geometry", "output_config"]
        
        for field in required_fields:
            if field not in scheme:
                result.add_error(f"缺少必需字段: {field}")
        
        # 验证 project_info
        if "project_info" in scheme:
            proj = scheme["project_info"]
            if "drawing_number" not in proj:
                result.add_error("project_info 缺少 drawing_number")
    
    def _validate_equipment(self, objects: List[Dict], result: ValidationResult):
        """验证设备列表"""
        if not objects:
            result.add_warning("没有设备对象")
            return
        
        tags = set()
        for obj in objects:
            # 检查必需字段
            if "id" not in obj:
                result.add_error(f"设备对象缺少 id 字段")
            if "label" not in obj:
                result.add_error(f"设备对象缺少 label 字段")
            
            # 检查标签唯一性
            tag = obj.get("label", "")
            if tag in tags:
                result.add_error(f"设备标签重复: {tag}")
            tags.add(tag)
            
            # 检查设备类型
            ai_type = obj.get("ai_type", "")
            if ai_type and ai_type not in self.EQUIPMENT_TYPES:
                result.add_warning(f"未知的设备类型: {ai_type}")
            
            # 检查位置
            pos = obj.get("position", {})
            if not isinstance(pos, dict):
                result.add_error(f"设备 {tag} 的 position 格式错误")
            elif "x" not in pos or "y" not in pos:
                result.add_warning(f"设备 {tag} 的 position 缺少 x 或 y 坐标")
    
    def _validate_connections(self, connections: List[Dict], objects: List[Dict], result: ValidationResult):
        """验证连接关系"""
        if not connections:
            result.add_warning("没有连接关系")
            return
        
        # 构建设备ID映射
        object_ids = {obj.get("id") for obj in objects}
        object_labels = {obj.get("label") for obj in objects}
        
        for conn in connections:
            from_id = conn.get("from", "")
            to_id = conn.get("to", "")
            
            # 检查连接的设备是否存在
            if from_id not in object_ids and from_id not in object_labels:
                result.add_error(f"连接的源设备不存在: {from_id}")
            if to_id not in object_ids and to_id not in object_labels:
                result.add_error(f"连接的目标设备不存在: {to_id}")
            
            # 检查自连接
            if from_id == to_id:
                result.add_error(f"设备 {from_id} 存在自连接")
            
            # 检查连接类型
            conn_type = conn.get("type", "pipe")
            if conn_type not in self.CONNECTION_TYPES:
                result.add_warning(f"未知的连接类型: {conn_type}")
    
    def _validate_streams(self, streams: List[Dict], result: ValidationResult):
        """验证流体参数"""
        if not streams:
            result.add_warning("没有流体参数数据")
            return
        
        for stream in streams:
            stream_no = stream.get("stream_no", "未知")
            
            # 检查必需参数
            for param in self.REQUIRED_STREAM_PARAMS:
                if param not in stream or stream[param] is None:
                    if self.strict_mode:
                        result.add_error(f"物流 {stream_no} 缺少参数: {param}")
                    else:
                        result.add_warning(f"物流 {stream_no} 缺少参数: {param}")
            
            # 检查温度合理性
            t_c = stream.get("T_C")
            if t_c is not None:
                if t_c < -273.15:
                    result.add_error(f"物流 {stream_no} 温度低于绝对零度: {t_c}°C")
                elif t_c > 1000:
                    result.add_warning(f"物流 {stream_no} 温度异常高: {t_c}°C")
            
            # 检查压力合理性
            p_mpa = stream.get("P_MPa")
            if p_mpa is not None:
                if p_mpa < 0:
                    result.add_error(f"物流 {stream_no} 压力为负值: {p_mpa} MPa")
                elif p_mpa > 100:
                    result.add_warning(f"物流 {stream_no} 压力异常高: {p_mpa} MPa")
    
    def _validate_instruments(self, instruments: List[Dict], connections: List[Dict], result: ValidationResult):
        """验证仪表配置"""
        if not instruments:
            return
        
        # 构建连接标签集合
        connection_labels = {conn.get("label", "") for conn in connections}
        
        for inst in instruments:
            tag = inst.get("tag", "未知")
            inst_type = inst.get("type", "")
            
            # 检查仪表类型
            valid_types = {"TI", "TIC", "TT", "PI", "PIC", "PT", "FI", "FIC", "FT", "LI", "LIC", "LT"}
            if inst_type and inst_type not in valid_types:
                result.add_warning(f"仪表 {tag} 类型可能不标准: {inst_type}")
            
            # 检查仪表位置
            on_line = inst.get("on_line", "")
            if on_line and on_line not in connection_labels:
                result.add_warning(f"仪表 {tag} 的 on_line 引用不存在: {on_line}")
    
    def _validate_output_config(self, config: Dict, result: ValidationResult):
        """验证输出配置"""
        if "drawing_type" not in config:
            result.add_error("output_config 缺少 drawing_type")
        else:
            valid_types = {"pfd", "pid", "2d", "3d", "model", "layout", "isometric"}
            drawing_type = config["drawing_type"]
            if drawing_type not in valid_types:
                result.add_warning(f"未知的图纸类型: {drawing_type}")
        
        # 检查比例
        scale = config.get("scale", "")
        if scale and ":" not in scale:
            result.add_warning(f"比例格式可能不正确: {scale}")


def validate_scheme(scheme: Dict, strict_mode: bool = False) -> ValidationResult:
    """验证方案的便捷函数"""
    validator = ConstraintValidator(strict_mode=strict_mode)
    return validator.validate(scheme)
