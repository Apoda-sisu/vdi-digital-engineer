#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FreeCAD 基础测试脚本
"""

import sys
import os

# 添加 FreeCAD 路径
freecad_path = "/Applications/FreeCAD.app/Contents/Resources/lib"
if freecad_path not in sys.path:
    sys.path.insert(0, freecad_path)

# 测试导入
print("测试 FreeCAD 导入...")
try:
    import FreeCAD as App
    import Part
    print(f"FreeCAD 版本: {App.Version()[0]}.{App.Version()[1]}.{App.Version()[2]}")
    print("导入成功!")
except ImportError as e:
    print(f"导入失败: {e}")
    sys.exit(1)

# 测试创建文档
print("\n测试创建文档...")
try:
    doc = App.newDocument("Test")
    print(f"文档创建成功: {doc.Name}")
except Exception as e:
    print(f"文档创建失败: {e}")
    sys.exit(1)

# 测试创建几何体
print("\n测试创建几何体...")
try:
    # 创建长方体
    box = Part.makeBox(100, 50, 30)
    box_obj = doc.addObject("Part::Feature", "Box")
    box_obj.Shape = box
    
    # 创建圆柱体
    cylinder = Part.makeCylinder(20, 80)
    cylinder_obj = doc.addObject("Part::Feature", "Cylinder")
    cylinder_obj.Shape = cylinder
    
    # 重新计算
    doc.recompute()
    
    print(f"几何体创建成功: {len(doc.Objects)} 个对象")
except Exception as e:
    print(f"几何体创建失败: {e}")
    sys.exit(1)

# 测试保存文档
print("\n测试保存文档...")
try:
    output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "output")
    os.makedirs(output_dir, exist_ok=True)
    output_file = os.path.join(output_dir, "basic_test.FCStd")
    
    doc.saveAs(output_file)
    print(f"文档保存成功: {output_file}")
except Exception as e:
    print(f"文档保存失败: {e}")
    sys.exit(1)

print("\n" + "=" * 50)
print("所有测试通过!")
print("=" * 50)