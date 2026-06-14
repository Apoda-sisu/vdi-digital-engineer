#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FreeCAD 绘图脚本模板
用于在 FreeCAD 环境中运行的绘图脚本
"""

import sys
import json
from pathlib import Path

# 添加模块路径
sys.path.insert(0, str(Path(__file__).parent.parent))


def load_input_data(input_path: str) -> dict:
    """加载输入数据"""
    with open(input_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def create_pfd_drawing(input_data: dict, output_path: str):
    """
    创建 PFD 绘图
    
    Args:
        input_data: 输入数据
        output_path: 输出路径
    """
    try:
        import FreeCAD as App
        import Part
    except ImportError:
        print("错误: 需要在 FreeCAD 环境中运行此脚本")
        return False
    
    # 创建新文档
    doc = App.newDocument("PFD_Drawing")
    
    # 提取数据
    geometry = input_data.get("geometry", {})
    objects = geometry.get("objects", [])
    connections = geometry.get("connections", [])
    
    # 创建设备
    for obj in objects:
        symbol_id = obj.get("symbol_id", "")
        position = obj.get("position", {"x": 0, "y": 0})
        label = obj.get("label", "")
        
        # 根据符号类型创建形状
        if "PUMP" in symbol_id:
            shape = Part.makeCylinder(20, 40)
        elif "VALVE" in symbol_id:
            shape = Part.makeBox(30, 10, 10)
        elif "VESSEL" in symbol_id or "TANK" in symbol_id:
            shape = Part.makeCylinder(30, 60)
        else:
            shape = Part.makeBox(50, 50, 10)
        
        # 创建 FreeCAD 对象
        fc_obj = doc.addObject("Part::Feature", label)
        fc_obj.Shape = shape
        
        # 设置位置
        fc_obj.Placement = App.Placement(
            App.Vector(position.get("x", 0), position.get("y", 0), 0),
            App.Rotation(0, 0, 0)
        )
    
    # 创建连接管道
    for conn in connections:
        from_id = conn.get("from")
        to_id = conn.get("to")
        
        # 查找设备位置
        from_pos = None
        to_pos = None
        
        for obj in objects:
            if obj.get("id") == from_id:
                from_pos = obj.get("position", {"x": 0, "y": 0})
            if obj.get("id") == to_id:
                to_pos = obj.get("position", {"x": 0, "y": 0})
        
        if from_pos and to_pos:
            # 创建管道线
            start = App.Vector(from_pos["x"], from_pos["y"], 0)
            end = App.Vector(to_pos["x"], to_pos["y"], 0)
            line = Part.makeLine(start, end)
            
            fc_obj = doc.addObject("Part::Feature", f"Pipe_{conn.get('id', '')}")
            fc_obj.Shape = line
    
    # 重新计算文档
    doc.recompute()
    
    # 保存文档
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    doc.saveAs(str(output_path))
    
    print(f"PFD 绘图创建成功: {output_path}")
    print(f"设备数量: {len(objects)}")
    print(f"连接数量: {len(connections)}")
    
    return True


def main():
    """主函数"""
    if len(sys.argv) < 3:
        print("用法: python freecad_drawing_template.py <input.json> <output.FCStd>")
        return False
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    # 加载输入数据
    input_data = load_input_data(input_path)
    
    # 创建绘图
    return create_pfd_drawing(input_data, output_path)


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)