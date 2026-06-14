#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
运行 PFD 测试脚本
"""

import sys
import json
from pathlib import Path

# 添加模块路径
sys.path.insert(0, str(Path(__file__).parent.parent))


def main():
    """主函数"""
    try:
        import FreeCAD as App
        import Part
    except ImportError:
        print("错误: 需要在 FreeCAD 环境中运行此脚本")
        return False
    
    # 加载输入数据
    input_path = Path(__file__).parent.parent / "examples" / "input" / "example_pfd.json"
    with open(input_path, 'r', encoding='utf-8') as f:
        input_data = json.load(f)
    
    # 创建新文档
    doc = App.newDocument("PFD_Test")
    
    # 提取数据
    geometry = input_data.get("geometry", {})
    objects = geometry.get("objects", [])
    connections = geometry.get("connections", [])
    
    print(f"创建 PFD 绘图...")
    print(f"设备数量: {len(objects)}")
    print(f"连接数量: {len(connections)}")
    
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
        
        print(f"  创建设备: {label} ({symbol_id})")
    
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
            
            print(f"  创建管道: {from_id} -> {to_id}")
    
    # 重新计算文档
    doc.recompute()
    
    # 保存文档
    output_dir = Path(__file__).parent.parent / "output"
    output_dir.mkdir(exist_ok=True)
    output_file = output_dir / "pfd_test.FCStd"
    doc.saveAs(str(output_file))
    
    print(f"\nPFD 绘图创建成功!")
    print(f"输出文件: {output_file}")
    print(f"对象数量: {len(doc.Objects)}")
    
    return True


if __name__ == "__main__":
    success = main()
    print(f"\n测试结果: {'成功' if success else '失败'}")
    sys.exit(0 if success else 1)