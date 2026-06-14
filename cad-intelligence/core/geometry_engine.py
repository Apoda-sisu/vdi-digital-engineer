"""
几何建模引擎
基于FreeCAD Part模块的几何建模核心
"""

import json
import logging
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger(__name__)


class GeometryEngine:
    """几何建模引擎"""
    
    def __init__(
        self,
        config_path: Optional[str] = None,
        use_active_document: bool = True,
    ):
        self.config = self._load_config(config_path)
        self.symbols = {}
        self._load_symbols()
        self._object_map: Dict[str, Any] = {}
        self._position_map: Dict[str, Dict[str, float]] = {}
        self._owns_document = False

        self.doc = None
        self._init_freecad(use_active_document=use_active_document)
        logger.info("几何建模引擎初始化完成")
    
    def _init_freecad(self, use_active_document: bool = True):
        """初始化FreeCAD环境"""
        try:
            import FreeCAD as App
            self.App = App
            self.Part = __import__('Part')

            if use_active_document and App.ActiveDocument:
                self.doc = App.ActiveDocument
                self._owns_document = False
            else:
                self.doc = App.newDocument("CAD_Intelligence")
                self._owns_document = True
            logger.info("FreeCAD环境初始化成功")
        except ImportError as e:
            logger.warning(f"FreeCAD未安装或无法导入: {e}")
            self.App = None
            self.Part = None
    
    def _load_config(self, config_path: Optional[str]) -> Dict:
        """加载配置文件"""
        if config_path is None:
            from core.paths import load_merged_config
            return load_merged_config()
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def _load_symbols(self):
        """加载符号库"""
        symbols_path = Path(__file__).parent.parent / "symbols"
        
        # 加载设备符号（递归搜索子目录）
        equipment_path = symbols_path / "equipment"
        if equipment_path.exists():
            for symbol_file in equipment_path.rglob("*.json"):
                try:
                    with open(symbol_file, 'r', encoding='utf-8') as f:
                        symbol_data = json.load(f)
                        symbol_id = symbol_data.get("symbol_id")
                        if symbol_id:
                            self.symbols[symbol_id] = symbol_data
                            logger.debug(f"加载符号: {symbol_id}")
                except Exception as e:
                    logger.error(f"加载符号文件失败: {symbol_file}, 错误: {e}")
        
        # 加载仪表符号
        instruments_path = symbols_path / "instruments"
        if instruments_path.exists():
            for symbol_file in instruments_path.rglob("*.json"):
                try:
                    with open(symbol_file, 'r', encoding='utf-8') as f:
                        symbol_data = json.load(f)
                        symbol_id = symbol_data.get("symbol_id")
                        if symbol_id:
                            self.symbols[symbol_id] = symbol_data
                            logger.debug(f"加载符号: {symbol_id}")
                except Exception as e:
                    logger.error(f"加载符号文件失败: {symbol_file}, 错误: {e}")
        
        logger.info(f"已加载 {len(self.symbols)} 个符号")
    
    def generate(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        根据输入数据生成图纸
        
        Args:
            input_data: 输入数据，包含geometry、annotations等
            
        Returns:
            生成结果，包含文件路径和元数据
        """
        input_type = input_data.get("input_type", "scheme")
        
        if input_type == "scheme":
            return self._generate_from_scheme(input_data)
        elif input_type == "scheme_with_sketch":
            return self._generate_from_scheme_with_sketch(input_data)
        else:
            raise ValueError(f"不支持的输入类型: {input_type}")
    
    def _generate_from_scheme(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """从结构化数据生成图纸"""
        logger.info("开始从结构化数据生成图纸")
        
        # 提取数据
        project_info = input_data.get("project_info", {})
        geometry = input_data.get("geometry", {})
        annotations = input_data.get("annotations", {})
        output_config = input_data.get("output_config", {})
        
        # 验证输入
        self._validate_input(geometry)
        
        # 生成几何体
        objects = geometry.get("objects", [])
        connections = geometry.get("connections", [])
        
        self._object_map.clear()
        self._position_map.clear()

        freecad_objects = []
        for obj in objects:
            fc_obj = self._create_freecad_object(obj)
            if fc_obj:
                freecad_objects.append(fc_obj)
                obj_id = obj.get("id")
                if obj_id:
                    self._object_map[obj_id] = fc_obj
                    self._position_map[obj_id] = obj.get("position", {"x": 0, "y": 0})

        pipe_objects = self._create_connections(connections, objects)
        freecad_objects.extend(pipe_objects)

        if self.doc:
            self.doc.recompute()
        
        result = {
            "status": "success",
            "output_type": "2d_drawing" if output_config.get("drawing_type") in ["pfd", "pid"] else "3d_model",
            "files": {},
            "metadata": {
                "project_id": project_info.get("project_id"),
                "drawing_number": project_info.get("drawing_number"),
                "object_count": len(objects),
                "connection_count": len(connections),
                "drawing_standard": output_config.get("dimension_standard", "GB"),
                "freecad_objects": len(freecad_objects)
            }
        }
        
        logger.info(f"图纸生成完成: {len(objects)} 个对象, {len(connections)} 个连接")
        return result
    
    def _generate_from_scheme_with_sketch(self, input_data: Dict[str, Any]) -> Dict[str, Any]:
        """草图识别已于 v1.3 移除"""
        raise NotImplementedError("草图识别功能已移除，请使用 scheme JSON 或自然语言对话")
    
    def _validate_input(self, geometry: Dict[str, Any]):
        """验证输入数据"""
        objects = geometry.get("objects", [])
        connections = geometry.get("connections", [])
        
        # 验证对象ID唯一性
        object_ids = [obj.get("id") for obj in objects]
        if len(object_ids) != len(set(object_ids)):
            raise ValueError("对象ID不唯一")
        
        # 验证连接引用的有效性
        object_id_set = set(object_ids)
        for conn in connections:
            from_id = conn.get("from")
            to_id = conn.get("to")
            if from_id and from_id not in object_id_set:
                raise ValueError(f"连接引用的对象不存在: {from_id}")
            if to_id and to_id not in object_id_set:
                raise ValueError(f"连接引用的对象不存在: {to_id}")
    
    def _create_freecad_object(self, obj: Dict[str, Any]) -> Any:
        """
        创建FreeCAD对象
        
        Args:
            obj: 对象定义
            
        Returns:
            FreeCAD对象
        """
        if not self.doc or not self.Part:
            logger.warning("FreeCAD未初始化，跳过对象创建")
            return None
        
        obj_type = obj.get("type", "equipment")
        symbol_id = obj.get("symbol_id", "")
        position = obj.get("position", {"x": 0, "y": 0})
        rotation = obj.get("rotation", 0)
        scale = obj.get("scale", 1)
        label = obj.get("label", "")
        
        # 根据符号ID创建几何体
        shape = self._create_shape_from_symbol(symbol_id, position, scale)
        
        if shape:
            safe_name = self._safe_object_name(label or obj.get("id", "Object"))
            fc_obj = self.doc.addObject("Part::Feature", safe_name)
            fc_obj.Label = label or safe_name
            fc_obj.Shape = shape
            
            # 设置位置
            fc_obj.Placement = self.App.Placement(
                self.App.Vector(position.get("x", 0), position.get("y", 0), 0),
                self.App.Rotation(0, 0, rotation)
            )
            
            logger.debug(f"创建FreeCAD对象: {label}")
            return fc_obj
        
        return None
    
    def _create_shape_from_symbol(self, symbol_id: str, position: Dict, scale: float) -> Any:
        """
        根据符号ID创建几何形状
        
        Args:
            symbol_id: 符号ID
            position: 位置
            scale: 缩放比例
            
        Returns:
            FreeCAD形状
        """
        if not self.Part:
            return None
        
        symbol = self.symbols.get(symbol_id)
        if not symbol:
            return self.Part.makeBox(50 * scale, 50 * scale, 10)

        from core.symbol_geometry import build_shape_from_symbol
        try:
            return build_shape_from_symbol(symbol, self.Part, scale)
        except Exception as e:
            logger.warning(f"符号几何构建失败 {symbol_id}: {e}")
            category = symbol.get("category", "")
            if category == "equipment":
                return self._create_equipment_shape(symbol, position, scale)
            if category == "instruments":
                return self._create_instrument_shape(symbol, position, scale)
            return self.Part.makeBox(50 * scale, 50 * scale, 10)

    def _safe_object_name(self, name: str) -> str:
        safe = "".join(c if c.isalnum() or c in "_-" else "_" for c in str(name))
        return safe or "Object"

    def _create_connections(
        self,
        connections: List[Dict[str, Any]],
        objects: List[Dict[str, Any]],
    ) -> List[Any]:
        if not self.doc or not self.Part or not connections:
            return []

        id_to_pos = dict(self._position_map)
        for obj in objects:
            oid = obj.get("id")
            if oid:
                id_to_pos[oid] = obj.get("position", {"x": 0, "y": 0})

        created = []
        for conn in connections:
            from_id = conn.get("from")
            to_id = conn.get("to")
            from_pos = id_to_pos.get(from_id)
            to_pos = id_to_pos.get(to_id)
            if not from_pos or not to_pos:
                continue
            start = self.App.Vector(from_pos.get("x", 0), from_pos.get("y", 0), 0)
            end = self.App.Vector(to_pos.get("x", 0), to_pos.get("y", 0), 0)
            if start.distanceToPoint(end) < 0.01:
                continue
            line = self.Part.makeLine(start, end)
            label = conn.get("label") or conn.get("id") or "Pipe"
            fc_obj = self.doc.addObject("Part::Feature", self._safe_object_name(f"Pipe_{label}"))
            fc_obj.Label = str(label)
            fc_obj.Shape = line
            created.append(fc_obj)
        return created
    
    def _create_equipment_shape(self, symbol: Dict, position: Dict, scale: float) -> Any:
        """创建设备形状"""
        name = symbol.get("name", "")
        
        if "泵" in name or "pump" in name.lower():
            # 泵：圆柱体
            return self.Part.makeCylinder(20 * scale, 40 * scale)
        elif "阀" in name or "valve" in name.lower():
            # 阀门：两个立方体
            box1 = self.Part.makeBox(30 * scale, 10 * scale, 10 * scale)
            box2 = self.Part.makeBox(10 * scale, 30 * scale, 10 * scale)
            return box1.fuse(box2)
        elif "罐" in name or "tank" in name.lower():
            # 储罐：圆柱体
            return self.Part.makeCylinder(30 * scale, 60 * scale)
        elif "反应" in name or "reactor" in name.lower():
            # 反应器：圆柱体带封头
            return self.Part.makeCylinder(25 * scale, 50 * scale)
        else:
            # 默认：立方体
            return self.Part.makeBox(50 * scale, 50 * scale, 50 * scale)
    
    def _create_instrument_shape(self, symbol: Dict, position: Dict, scale: float) -> Any:
        """创建仪表形状"""
        # 仪表：球体
        return self.Part.makeSphere(15 * scale)
    
    def create_primitive(self, primitive_type: str, params: Dict[str, Any]) -> Any:
        """
        创建基本几何体
        
        Args:
            primitive_type: 几何体类型 (box, cylinder, sphere, cone)
            params: 几何体参数
            
        Returns:
            FreeCAD几何体对象
        """
        if not self.Part:
            logger.warning("FreeCAD未初始化，返回参数字典")
            return {"type": primitive_type, "params": params}
        
        if primitive_type == "box":
            length = params.get("length", 100)
            width = params.get("width", 100)
            height = params.get("height", 100)
            return self.Part.makeBox(length, width, height)
        elif primitive_type == "cylinder":
            radius = params.get("radius", 50)
            height = params.get("height", 100)
            return self.Part.makeCylinder(radius, height)
        elif primitive_type == "sphere":
            radius = params.get("radius", 50)
            return self.Part.makeSphere(radius)
        elif primitive_type == "cone":
            radius1 = params.get("radius1", 50)
            radius2 = params.get("radius2", 0)
            height = params.get("height", 100)
            return self.Part.makeCone(radius1, radius2, height)
        else:
            raise ValueError(f"不支持的几何体类型: {primitive_type}")
    
    def apply_boolean_operation(self, shape1: Any, shape2: Any, operation: str) -> Any:
        """
        应用布尔运算
        
        Args:
            shape1: 第一个几何体
            shape2: 第二个几何体
            operation: 运算类型 (fuse, cut, intersect)
            
        Returns:
            运算结果
        """
        if not self.Part:
            logger.warning("FreeCAD未初始化，返回操作字典")
            return {"operation": operation, "shapes": [shape1, shape2]}
        
        if operation == "fuse":
            return shape1.fuse(shape2)
        elif operation == "cut":
            return shape1.cut(shape2)
        elif operation == "intersect":
            return shape1.common(shape2)
        else:
            raise ValueError(f"不支持的布尔运算: {operation}")
    
    def get_symbol(self, symbol_id: str) -> Optional[Dict[str, Any]]:
        """
        获取符号定义
        
        Args:
            symbol_id: 符号ID
            
        Returns:
            符号定义字典，如果不存在则返回None
        """
        return self.symbols.get(symbol_id)
    
    def list_symbols(self, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        列出符号
        
        Args:
            category: 符号类别筛选
            
        Returns:
            符号列表
        """
        symbols_list = list(self.symbols.values())
        
        if category:
            symbols_list = [s for s in symbols_list if s.get("category") == category]
        
        return symbols_list
    
    def save_document(self, output_path: str) -> Dict[str, Any]:
        """
        保存FreeCAD文档
        
        Args:
            output_path: 输出路径
            
        Returns:
            保存结果
        """
        if not self.doc:
            return {"status": "error", "error": "FreeCAD文档未初始化"}
        
        try:
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            self.doc.saveAs(str(output_path))
            
            return {
                "status": "success",
                "output_path": str(output_path),
                "file_size": output_path.stat().st_size if output_path.exists() else 0
            }
        except Exception as e:
            logger.error(f"保存文档失败: {e}")
            return {"status": "error", "error": str(e)}
    
    def close(self):
        """关闭引擎，释放资源（仅关闭本引擎创建的文档）"""
        if not self._owns_document:
            return
        if self.doc and self.App:
            try:
                self.App.closeDocument(self.doc.Name)
                logger.info("FreeCAD文档已关闭")
            except Exception as e:
                logger.error(f"关闭文档失败: {e}")
        
        self.doc = None