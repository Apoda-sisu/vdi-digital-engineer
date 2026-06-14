#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通过FreeCAD运行生成命令
"""

import sys
import os

# 添加模块路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import click
from cli import generate

if __name__ == "__main__":
    # 使用click运行generate命令
    generate(standalone_mode=False)