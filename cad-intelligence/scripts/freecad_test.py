#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FreeCAD集成测试脚本
测试FreeCAD Python API的基本功能
"""

import sys
import os

# 添加模块路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def log(message):
    """输出日志"""
    sys.stdout.write(f"{message}\n")
    sys.stdout.flush()

def test_freecad_import():
    """测试FreeCAD模块导入"""
    try:
        import FreeCAD as App
        import Part
        version = f"{App.Version()[0]}.{App.Version()[1]}.{App.Version()[2]}"
        log(f"FreeCAD版本: {version}")
        log("FreeCAD模块导入成功")
        return True
    except ImportError as e:
        log(f"FreeCAD模块导入失败: {e}")
        return False

def test_create_document():
    """测试创建文档"""
    try:
        import FreeCAD as App
        
        # 创建新文档
        doc = App.newDocument("TestDocument")
        log(f"文档创建成功: {doc.Name}")
        
        # 保存文档
        output_dir = os.path.join(os.path.dirname(__file__), "..", "output")
        os.makedirs(output_dir, exist_ok=True)
        output_file = os.path.join(output_dir, "test_document.FCStd")
        
        doc.saveAs(output_file)
        log(f"文档保存成功: {output_file}")
        
        return True
    except Exception as e:
        log(f"文档创建失败: {e}")
        return False

def test_create_geometry():
    """测试创建几何体"""
    try:
        import FreeCAD as App
        import Part
        
        # 创建新文档
        doc = App.newDocument("GeometryTest")
        
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
        
        log(f"几何体创建成功: {len(doc.Objects)} 个对象")
        
        # 保存文档
        output_dir = os.path.join(os.path.dirname(__file__), "..", "output")
        os.makedirs(output_dir, exist_ok=True)
        output_file = os.path.join(output_dir, "geometry_test.FCStd")
        
        doc.saveAs(output_file)
        log(f"几何体文档保存成功: {output_file}")
        
        return True
    except Exception as e:
        log(f"几何体创建失败: {e}")
        return False

def main():
    """主测试函数"""
    log("=" * 50)
    log("FreeCAD集成测试")
    log("=" * 50)
    
    # 测试1: FreeCAD导入
    log("\n1. 测试FreeCAD模块导入")
    if not test_freecad_import():
        log("测试失败: FreeCAD模块导入失败")
        return False
    
    # 测试2: 创建文档
    log("\n2. 测试创建文档")
    if not test_create_document():
        log("测试失败: 文档创建失败")
        return False
    
    # 测试3: 创建几何体
    log("\n3. 测试创建几何体")
    if not test_create_geometry():
        log("测试失败: 几何体创建失败")
        return False
    
    log("\n" + "=" * 50)
    log("所有测试通过！")
    log("=" * 50)
    
    return True

if __name__ == "__main__":
    success = main()
    log(f"\n测试结果: {'成功' if success else '失败'}")
    sys.exit(0 if success else 1)