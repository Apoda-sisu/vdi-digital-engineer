#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试输出脚本
"""

import sys
import logging

# 配置日志
logging.basicConfig(level=logging.DEBUG, format='%(message)s')

# 添加模块路径
sys.path.insert(0, '.')

# 测试输出
print("测试输出开始...")
sys.stdout.flush()

try:
    from core.geometry_engine import GeometryEngine
    print("成功导入 GeometryEngine")
    sys.stdout.flush()
    
    engine = GeometryEngine()
    print(f"几何引擎初始化成功")
    print(f"加载的符号数量: {len(engine.symbols)}")
    sys.stdout.flush()
    
    # 测试符号列表
    symbols = engine.list_symbols()
    print(f"符号列表: {len(symbols)} 个符号")
    sys.stdout.flush()
    
    # 测试基本几何体创建
    if engine.Part:
        box = engine.create_primitive('box', {'length': 100, 'width': 50, 'height': 30})
        print(f"创建长方体成功: {box}")
        
        cylinder = engine.create_primitive('cylinder', {'radius': 20, 'height': 80})
        print(f"创建圆柱体成功: {cylinder}")
    else:
        print('FreeCAD Part 模块未加载，跳过几何体创建测试')
    
    engine.close()
    print("测试完成")
except Exception as e:
    print(f"错误: {e}")
    import traceback
    traceback.print_exc()
finally:
    sys.stdout.flush()