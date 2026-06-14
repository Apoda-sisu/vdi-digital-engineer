---
name: CAD智能绘图
code: CADINT
description: CAD智能绘图模块。根据设计方案（JSON/自然语言）自动生成工程图。支持二维工程图（PFD + TechDraw 图纸页 + GB 图框）和参数化三维设备模型。触发场景：CAD绘图、图纸生成、模型创建、自然语言绘图。
metadata:
  cad_intelligence:
    version: 1.3.0
    type: standalone
    freecad_version: ">=1.1.1"
    supported_inputs:
      - scheme
      - chat
    supported_outputs:
      - FCStd
      - STEP
      - IGES
      - PDF
      - DXF
      - STL
    standards:
      - GB/T 2625-1981
      - HG/T 20559.2-1993
      - GB/T 50106-2010
---

# CAD智能绘图模块

## 模块概述

`cad-intelligence`是一个独立的智能绘图模块，专注于根据设计方案自动生成工程图。

**核心能力**：
1. 从JSON结构化数据生成二维工程图（PFD 符号 + 正交管线 + TechDraw 图纸页/GB A3 图框）
2. 参数化三维设备建模：泵/阀门/容器/换热器/反应器/塔/压缩机/风机 + 正交管道布线
3. 自然语言绘图：AI（Ollama / OpenAI 兼容）将指令转为绘图方案，面板可切换 2D/3D 模式
4. 内置国家标准符号库（泵、阀门、容器、仪表等），支持中国国标（GB）标注和绘图

> 草图识别功能已于 v1.3 移除。

## 使用方式

### 输入类型

#### 1. 方案输入（scheme）

纯结构化数据输入，包含设备列表、连接关系、参数等。

```json
{
  "input_type": "scheme",
  "project_info": {
    "project_id": "PRJ-001",
    "project_name": "某石化装置",
    "drawing_number": "PFD-001",
    "revision": "A"
  },
  "geometry": {
    "objects": [
      {
        "id": "EQ-001",
        "type": "equipment",
        "symbol_id": "PUMP-CENTRIFUGAL-001",
        "position": { "x": 100, "y": 200 },
        "label": "P-1001"
      }
    ],
    "connections": [
      {
        "id": "CONN-001",
        "type": "pipe",
        "from": "EQ-001",
        "to": "EQ-002",
        "label": "1001-A1A-H"
      }
    ]
  },
  "output_config": {
    "format": "FCStd",
    "drawing_type": "pfd",
    "scale": "1:100"
  }
}
```

`output_config.drawing_type` 决定产出模式：

| drawing_type | 产出 |
|--------------|------|
| `pfd` / `pid` / `2d` | 2D 符号 + 正交管线 + 位号标注 + TechDraw 图纸页（GB A3 图框，标题栏自动填充） |
| `3d` / `model` | 参数化三维设备模型 + 接管对接的正交管道 |

#### 2. 自然语言输入（chat）

通过 FreeCAD 面板或 CLI `chat` 命令，AI 将自然语言转为 plan JSON，再经 `chat_engine.ai_plan_to_scheme()` 转为 scheme，统一走 `DrawingPipeline`。

### 输出格式

#### 二维工程图

```json
{
  "status": "success",
  "output_type": "2d_drawing",
  "files": {
    "freecad_file": "output.FCStd",
    "pdf_file": "output.pdf"
  },
  "metadata": {
    "object_count": 15,
    "drawing_standard": "GB"
  }
}
```

#### 三维模型

```json
{
  "status": "success",
  "output_type": "3d_model",
  "files": {
    "freecad_file": "model.FCStd",
    "step_file": "model.stp"
  },
  "metadata": {
    "part_count": 10,
    "volume": "1.5 m³"
  }
}
```

## 符号库

### 设备符号

| 符号ID | 名称 | 标准 |
|--------|------|------|
| PUMP-CENTRIFUGAL-001 | 离心泵 | GB/T 2625 |
| VALVE-GATE-001 | 闸阀 | GB/T 2625 |
| VALVE-GLOBE-001 | 截止阀 | GB/T 2625 |
| VALVE-BALL-001 | 球阀 | GB/T 2625 |
| VESSEL-TANK-001 | 储罐 | HG/T 20559 |
| VESSEL-REACTOR-001 | 反应器 | HG/T 20559 |
| HX-SHELL-TUBE-001 | 管壳式换热器 | HG/T 20559 |

### 仪表符号

| 符号ID | 名称 | 说明 |
|--------|------|------|
| IND-TEMP-001 | 温度指示 | TI |
| IND-PRESS-001 | 压力指示 | PI |
| IND-LEVEL-001 | 液位指示 | LI |
| IND-FLOW-001 | 流量指示 | FI |
| CTRL-TEMP-001 | 温度控制 | TIC |
| CTRL-PRESS-001 | 压力控制 | PIC |

## 命令行接口

```bash
# 生成 2D PFD（含 TechDraw 页 + DXF）
freecadcmd cli.py generate --input input.json --output output/ --mode pfd --format FCStd --format DXF

# 生成 3D 模型
freecadcmd cli.py generate --input input.json --output output/ --mode 3d --format FCStd --format STEP

# 查看符号库
cad-intelligence symbols --category equipment --list

# 验证输入
cad-intelligence validate --input input.json

# 无头自检（25 项断言）
freecadcmd scripts/verify_r1.py
```

## 与VDI系统的关系

本模块独立于VDI系统，但预留了集成接口。未来可通过适配器将VDI的DesignOutput转换为本模块的输入格式。

---

**版本**：V1.3  
**更新日期**：2026-06-10