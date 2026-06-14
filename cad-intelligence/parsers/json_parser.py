"""
JSON输入解析器
解析结构化JSON输入数据
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)


class JSONParser:
    """JSON输入解析器"""
    
    REQUIRED_FIELDS = ["input_type", "project_info"]
    VALID_INPUT_TYPES = ["scheme", "scheme_with_sketch"]
    
    def __init__(self):
        """初始化JSON解析器"""
        logger.info("JSON解析器初始化完成")
    
    def parse(self, file_path: str) -> Dict[str, Any]:
        """
        解析JSON文件
        
        Args:
            file_path: JSON文件路径
            
        Returns:
            解析后的数据字典
        """
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")
        
        if not file_path.suffix.lower() == '.json':
            raise ValueError(f"文件格式错误: {file_path}，需要JSON格式")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        logger.info(f"已解析JSON文件: {file_path}")
        
        return self.parse_data(data)
    
    def parse_string(self, json_string: str) -> Dict[str, Any]:
        """
        解析JSON字符串
        
        Args:
            json_string: JSON字符串
            
        Returns:
            解析后的数据字典
        """
        data = json.loads(json_string)
        return self.parse_data(data)
    
    def parse_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        解析数据字典
        
        Args:
            data: 数据字典
            
        Returns:
            验证和处理后的数据
        """
        # 验证必要字段
        self._validate_required_fields(data)
        
        # 验证输入类型
        input_type = data.get("input_type")
        if input_type not in self.VALID_INPUT_TYPES:
            raise ValueError(f"不支持的输入类型: {input_type}")
        
        # 根据输入类型进行特定验证
        if input_type == "scheme":
            return self._parse_scheme(data)
        elif input_type == "scheme_with_sketch":
            return self._parse_scheme_with_sketch(data)
        
        return data
    
    def _validate_required_fields(self, data: Dict[str, Any]):
        """验证必要字段"""
        for field in self.REQUIRED_FIELDS:
            if field not in data:
                raise ValueError(f"缺少必要字段: {field}")
    
    def _parse_scheme(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """解析scheme类型输入"""
        # 验证geometry字段
        geometry = data.get("geometry")
        if not geometry:
            raise ValueError("scheme类型输入缺少geometry字段")
        
        # 验证objects
        objects = geometry.get("objects", [])
        if not isinstance(objects, list):
            raise ValueError("geometry.objects必须是数组")
        
        # 验证每个对象
        for obj in objects:
            self._validate_object(obj)
        
        # 验证connections
        connections = geometry.get("connections", [])
        if not isinstance(connections, list):
            raise ValueError("geometry.connections必须是数组")
        
        # 验证每个连接
        for conn in connections:
            self._validate_connection(conn)
        
        logger.info(f"scheme解析完成: {len(objects)} 个对象, {len(connections)} 个连接")
        
        return data
    
    def _parse_scheme_with_sketch(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """解析scheme_with_sketch类型输入"""
        # 验证sketch字段
        sketch = data.get("sketch")
        if not sketch:
            raise ValueError("scheme_with_sketch类型输入缺少sketch字段")
        
        # 验证image_path
        image_path = sketch.get("image_path")
        if not image_path:
            raise ValueError("sketch缺少image_path字段")
        
        # 验证图像文件存在
        if not Path(image_path).exists():
            logger.warning(f"警告: 草图图像文件不存在: {image_path}")
        
        logger.info(f"scheme_with_sketch解析完成: {image_path}")
        
        return data
    
    def _validate_object(self, obj: Dict[str, Any]):
        """验证对象"""
        required_fields = ["id", "type"]
        for field in required_fields:
            if field not in obj:
                raise ValueError(f"对象缺少必要字段: {field}")
        
        # 验证id唯一性（在调用层面处理）
        obj_id = obj.get("id")
        if not isinstance(obj_id, str):
            raise ValueError(f"对象id必须是字符串: {obj_id}")
    
    def _validate_connection(self, conn: Dict[str, Any]):
        """验证连接"""
        required_fields = ["id", "from", "to"]
        for field in required_fields:
            if field not in conn:
                raise ValueError(f"连接缺少必要字段: {field}")
    
    def create_scheme_input(self, project_info: Dict, objects: List[Dict], 
                           connections: List[Dict], output_config: Optional[Dict] = None) -> Dict[str, Any]:
        """
        创建scheme类型输入数据
        
        Args:
            project_info: 项目信息
            objects: 对象列表
            connections: 连接列表
            output_config: 输出配置
            
        Returns:
            scheme类型输入数据
        """
        return {
            "input_type": "scheme",
            "project_info": project_info,
            "geometry": {
                "objects": objects,
                "connections": connections
            },
            "annotations": {
                "dimensions": [],
                "labels": [],
                "notes": []
            },
            "output_config": output_config or {
                "format": "FCStd",
                "drawing_type": "pfd",
                "scale": "1:100",
                "dimension_standard": "GB"
            }
        }
    
    def create_scheme_with_sketch_input(self, project_info: Dict, image_path: str,
                                       scheme_hints: Optional[Dict] = None,
                                       output_config: Optional[Dict] = None) -> Dict[str, Any]:
        """
        创建scheme_with_sketch类型输入数据
        
        Args:
            project_info: 项目信息
            image_path: 草图图像路径
            scheme_hints: 方案提示
            output_config: 输出配置
            
        Returns:
            scheme_with_sketch类型输入数据
        """
        return {
            "input_type": "scheme_with_sketch",
            "project_info": project_info,
            "sketch": {
                "image_path": image_path,
                "image_format": Path(image_path).suffix.lstrip('.'),
                "preprocessing": {
                    "threshold": 128,
                    "denoise": True
                }
            },
            "scheme_hints": scheme_hints or {},
            "output_config": output_config or {
                "format": "FCStd",
                "drawing_type": "pfd",
                "scale": "1:100",
                "dimension_standard": "GB"
            }
        }