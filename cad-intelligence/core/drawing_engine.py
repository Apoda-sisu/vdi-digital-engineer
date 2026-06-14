"""
二维绘图引擎
基于FreeCAD的二维工程图绘制核心
"""

import logging
import math
from typing import Dict, List, Any, Optional, Tuple

logger = logging.getLogger(__name__)


class DrawingEngine:
    """二维绘图引擎"""
    
    def __init__(self, config: Optional[Dict] = None):
        """
        初始化绘图引擎
        
        Args:
            config: 绘图配置
        """
        self.config = config or {}
        self.drawing_standards = self.config.get("drawing", {}).get("standards", {})
        
        # FreeCAD环境
        self.App = None
        self.Part = None
        self.doc = None
        self._init_freecad()
        
        logger.info("二维绘图引擎初始化完成")
    
    def _init_freecad(self):
        """初始化FreeCAD环境"""
        try:
            import FreeCAD as App
            import Part
            self.App = App
            self.Part = Part
            
            # 创建新文档
            self.doc = App.newDocument("2D_Drawing")
            logger.info("FreeCAD二维绘图环境初始化成功")
        except ImportError as e:
            logger.warning(f"FreeCAD未安装或无法导入: {e}")
            logger.info("将使用模拟模式运行")
    
    def create_drawing(self, objects: List[Dict], connections: List[Dict], 
                       annotations: Dict, output_config: Dict) -> Dict[str, Any]:
        """
        创建二维工程图
        
        Args:
            objects: 设备对象列表
            connections: 连接关系列表
            annotations: 标注信息
            output_config: 输出配置
            
        Returns:
            绘图结果
        """
        logger.info(f"开始创建二维工程图: {len(objects)} 个设备, {len(connections)} 个连接")
        
        # 计算布局
        layout = self._calculate_layout(objects, connections)
        
        # 绘制设备符号
        equipment_elements = self._draw_equipment(objects, layout)
        
        # 绘制连接管道
        pipe_elements = self._draw_pipes(connections, layout)
        
        # 添加标注
        annotation_elements = self._add_annotations(annotations, layout)
        
        # 创建标题栏和图框
        title_block = self._create_title_block(output_config, layout)
        border = self._create_border(output_config, layout)
        
        result = {
            "layout": layout,
            "elements": {
                "equipment": equipment_elements,
                "pipes": pipe_elements,
                "annotations": annotation_elements,
                "title_block": title_block,
                "border": border
            },
            "statistics": {
                "equipment_count": len(equipment_elements),
                "pipe_count": len(pipe_elements),
                "annotation_count": len(annotation_elements)
            }
        }
        
        logger.info("二维工程图创建完成")
        return result
    
    def _calculate_layout(self, objects: List[Dict], connections: List[Dict]) -> Dict:
        """
        计算设备布局
        
        Args:
            objects: 设备对象列表
            connections: 连接关系列表
            
        Returns:
            布局信息
        """
        if not objects:
            return {"width": 0, "height": 0, "bounds": {}, "positions": {}}
        
        # 简单的网格布局
        positions = {}
        cols = max(1, int(len(objects) ** 0.5) + 1)
        
        for i, obj in enumerate(objects):
            row = i // cols
            col = i % cols
            positions[obj.get("id")] = {
                "x": col * 150 + 100,
                "y": row * 100 + 100
            }
        
        # 计算边界
        if positions:
            x_coords = [p["x"] for p in positions.values()]
            y_coords = [p["y"] for p in positions.values()]
            bounds = {
                "min_x": min(x_coords) - 50,
                "max_x": max(x_coords) + 50,
                "min_y": min(y_coords) - 50,
                "max_y": max(y_coords) + 50
            }
        else:
            bounds = {"min_x": 0, "max_x": 0, "min_y": 0, "max_y": 0}
        
        return {
            "width": bounds["max_x"] - bounds["min_x"],
            "height": bounds["max_y"] - bounds["min_y"],
            "bounds": bounds,
            "positions": positions
        }
    
    def _draw_equipment(self, objects: List[Dict], layout: Dict) -> List[Dict]:
        """
        绘制设备符号
        
        Args:
            objects: 设备对象列表
            layout: 布局信息
            
        Returns:
            设备元素列表
        """
        elements = []
        positions = layout.get("positions", {})
        
        for obj in objects:
            obj_id = obj.get("id")
            position = positions.get(obj_id, {"x": 0, "y": 0})
            
            # 创建设备几何体
            if self.Part and self.doc:
                self._create_equipment_geometry(obj, position)
            
            element = {
                "id": obj_id,
                "type": "equipment",
                "symbol_id": obj.get("symbol_id"),
                "position": position,
                "rotation": obj.get("rotation", 0),
                "scale": obj.get("scale", 1),
                "label": obj.get("label", ""),
                "bbox": {
                    "x": position["x"] - 25,
                    "y": position["y"] - 25,
                    "width": 50,
                    "height": 50
                }
            }
            
            elements.append(element)
        
        return elements
    
    def _create_equipment_geometry(self, obj: Dict, position: Dict):
        """创建设备几何体"""
        if not self.Part or not self.doc:
            return
        
        symbol_id = obj.get("symbol_id", "")
        scale = obj.get("scale", 1)
        label = obj.get("label", "")
        
        # 根据符号类型创建形状
        if "PUMP" in symbol_id:
            # 泵：圆
            shape = self.Part.makeCircle(20 * scale)
        elif "VALVE" in symbol_id:
            # 阀门：圆
            shape = self.Part.makeCircle(15 * scale)
        elif "VESSEL" in symbol_id or "TANK" in symbol_id:
            # 容器：矩形
            shape = self.Part.makeBox(40 * scale, 30 * scale, 1)
        else:
            # 默认：圆
            shape = self.Part.makeCircle(20 * scale)
        
        # 创建FreeCAD对象
        fc_obj = self.doc.addObject("Part::Feature", label)
        fc_obj.Shape = shape
        
        # 设置位置
        fc_obj.Placement = self.App.Placement(
            self.App.Vector(position.get("x", 0), position.get("y", 0), 0),
            self.App.Rotation(0, 0, 0)
        )
    
    def _draw_pipes(self, connections: List[Dict], layout: Dict) -> List[Dict]:
        """
        绘制管道连接
        
        Args:
            connections: 连接关系列表
            layout: 布局信息
            
        Returns:
            管道元素列表
        """
        elements = []
        positions = layout.get("positions", {})
        
        for conn in connections:
            from_id = conn.get("from")
            to_id = conn.get("to")
            
            from_pos = positions.get(from_id, {"x": 0, "y": 0})
            to_pos = positions.get(to_id, {"x": 0, "y": 0})
            
            # 计算连接点（设备边缘）
            from_point = self._get_edge_point(from_pos, to_pos)
            to_point = self._get_edge_point(to_pos, from_pos)
            
            # 创建管道线
            if self.Part and self.doc:
                self._create_pipe_geometry(from_point, to_point, conn)
            
            element = {
                "id": conn.get("id"),
                "type": "pipe",
                "from": from_id,
                "to": to_id,
                "points": [from_point, to_point],
                "label": conn.get("label", ""),
                "style": {
                    "line_type": "solid",
                    "line_weight": "medium"
                }
            }
            
            elements.append(element)
        
        return elements
    
    def _create_pipe_geometry(self, from_point: Dict, to_point: Dict, conn: Dict):
        """创建管道几何体"""
        if not self.Part or not self.doc:
            return
        
        # 创建线段
        start = self.App.Vector(from_point["x"], from_point["y"], 0)
        end = self.App.Vector(to_point["x"], to_point["y"], 0)
        
        line = self.Part.makeLine(start, end)
        
        # 创建FreeCAD对象
        label = conn.get("label", "Pipe")
        fc_obj = self.doc.addObject("Part::Feature", label)
        fc_obj.Shape = line
    
    def _get_edge_point(self, center: Dict, target: Dict, radius: int = 25) -> Dict:
        """
        计算设备边缘的连接点
        
        Args:
            center: 设备中心
            target: 目标点
            radius: 设备半径
            
        Returns:
            边缘点坐标
        """
        dx = target["x"] - center["x"]
        dy = target["y"] - center["y"]
        
        if dx == 0 and dy == 0:
            return center
        
        dist = math.sqrt(dx * dx + dy * dy)
        
        return {
            "x": center["x"] + radius * dx / dist,
            "y": center["y"] + radius * dy / dist
        }
    
    def _add_annotations(self, annotations: Dict, layout: Dict) -> List[Dict]:
        """
        添加标注
        
        Args:
            annotations: 标注信息
            layout: 布局信息
            
        Returns:
            标注元素列表
        """
        elements = []
        
        # 尺寸标注
        dimensions = annotations.get("dimensions", [])
        for dim in dimensions:
            element = {
                "type": "dimension",
                "dimension_type": dim.get("type", "linear"),
                "value": dim.get("value"),
                "unit": dim.get("unit", "mm"),
                "position": dim.get("position", {"x": 0, "y": 0})
            }
            elements.append(element)
        
        # 标签
        labels = annotations.get("labels", [])
        for label in labels:
            element = {
                "type": "label",
                "text": label.get("text"),
                "position": label.get("position", {"x": 0, "y": 0}),
                "style": {
                    "font_size": 12,
                    "alignment": "center"
                }
            }
            elements.append(element)
        
        return elements
    
    def _create_title_block(self, output_config: Dict, layout: Dict) -> Dict:
        """创建标题栏"""
        return {
            "type": "title_block",
            "content": {
                "project_name": output_config.get("project_name", ""),
                "drawing_number": output_config.get("drawing_number", ""),
                "revision": output_config.get("revision", "A"),
                "scale": output_config.get("scale", "1:100"),
                "date": output_config.get("date", ""),
                "drawn_by": output_config.get("drawn_by", ""),
                "checked_by": output_config.get("checked_by", "")
            },
            "position": {"x": 0, "y": 0},
            "size": {"width": 180, "height": 56}
        }
    
    def _create_border(self, output_config: Dict, layout: Dict) -> Dict:
        """创建图框"""
        # 根据图纸尺寸计算
        paper_size = output_config.get("paper_size", "A3")
        
        # A3图纸尺寸 (mm)
        paper_sizes = {
            "A0": (1189, 841),
            "A1": (841, 594),
            "A2": (594, 420),
            "A3": (420, 297),
            "A4": (297, 210)
        }
        
        width, height = paper_sizes.get(paper_size, (420, 297))
        
        # 检查是否横向
        if output_config.get("orientation") == "landscape":
            width, height = height, width
        
        margin = 10
        
        return {
            "type": "border",
            "paper_size": paper_size,
            "outer": {
                "x": 0,
                "y": 0,
                "width": width,
                "height": height
            },
            "inner": {
                "x": margin,
                "y": margin,
                "width": width - 2 * margin,
                "height": height - 2 * margin
            }
        }
    
    def save_drawing(self, output_path: str) -> Dict[str, Any]:
        """
        保存二维工程图
        
        Args:
            output_path: 输出路径
            
        Returns:
            保存结果
        """
        if not self.doc:
            return {"status": "error", "error": "FreeCAD文档未初始化"}
        
        try:
            from pathlib import Path
            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            self.doc.saveAs(str(output_path))
            
            return {
                "status": "success",
                "output_path": str(output_path),
                "file_size": output_path.stat().st_size if output_path.exists() else 0
            }
        except Exception as e:
            logger.error(f"保存工程图失败: {e}")
            return {"status": "error", "error": str(e)}
    
    def close(self):
        """关闭引擎，释放资源"""
        if self.doc and self.App:
            try:
                self.App.closeDocument(self.doc.Name)
                logger.info("二维工程图文档已关闭")
            except Exception as e:
                logger.error(f"关闭文档失败: {e}")
        
        self.doc = None