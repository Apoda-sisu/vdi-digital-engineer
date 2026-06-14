# Scheme JSON 与 VDI PFD/P&ID 字段对照

> 版本：v1.3 | 对应 `schemas/scheme-v1.schema.json` 与 `core/scheme_schema.py`

## 四阶段路线图

| 阶段 | VDI CP | drawing_type | cad-intelligence 能力 | MUST 数据 |
|------|--------|--------------|----------------------|-----------|
| **0 数据门禁** | CP-0 | — | `validate_for_pfd()` / `enrich_scheme()` | material_balance, equipment_draft_datasheets, control_philosophy |
| **1 PFD PDF** | CP-1 | `pfd` | 符号+物流号+管段号+管道表+GB 图框+PDF/DXF | streams[], equipment.label, connections[].label |
| **2 P&ID** | CP-2 | `pid` | ✅ 仪表+管阀+完整管道表+因果表+PDF/DXF | instruments[], 设计/操作 T/P, 材质/保温 |
| **3 施工图（尽量）** | CP-3+ | `layout` / `isometric` | 平面布置+尺寸标注+简化单线 | 设备坐标/标高/管架 |
| **4 闭环** | 全部 | 全部 | 修订号、人类确认闸门、DATA_REQUEST | vdi_source.cp_stage |

---

## VDI MUST 输入 → scheme 字段

| VDI Skill (`vdi-process-pfd-pid`) | scheme JSON 路径 | 说明 |
|-----------------------------------|------------------|------|
| `material_balance` | `streams[]` + `tables.stream_list[]` | 物流号、流量、组成、相态、T/P |
| `equipment_draft_datasheets` | `geometry.objects[]` + `tables.equipment_list[]` | 位号 `label`、类型、操作/设计条件 |
| `control_philosophy` | `geometry.instruments[]` + `tables.cause_effect[]` | P&ID 阶段；PFD 仅主要控制点 |

### CP-1 PFD 物流表 → streams

| VDI CP-1 列 | scheme `streams[]` 字段 |
|-------------|-------------------------|
| 物流号 | `stream_no` |
| 起 | `from_tag` |
| 止 | `to_tag` |
| 流量 | `flow` |
| T (°C) | `T_C` |
| P (MPaG) | `P_MPa` |
| 相态 | `phase` |
| — | `connection_id`（关联 `geometry.connections[].id`） |

### CP-1 设备位号表 → geometry.objects

| VDI CP-1 列 | scheme 字段 |
|-------------|-------------|
| 位号 | `geometry.objects[].label` |
| 类型 | `ai_type` / `symbol_id` |
| 操作 T | `parameters.oper_T_C` 或 `parameters.design_T_C` |
| 操作 P | `parameters.oper_P_MPa` |

### CP-2 管道表 → tables.pipe_list

| VDI CP-2 列 | scheme `tables.pipe_list[]` |
|-------------|----------------------------|
| 管段号 | `line_no` |
| 起 | `from_tag` |
| 止 | `to_tag` |
| 介质 | `medium` |
| 相态 | `phase` |
| 设计 T/P | `design_T_C` / `design_P_MPa` |
| 操作 T/P | `oper_T_C` / `oper_P_MPa` |
| DN | `DN` |
| 材质 | `material` |
| 保温 | `insulation` |
| 物流号（PFD） | `stream_no` |

### CP-2 仪表 → geometry.instruments（阶段2 待实现）

| VDI | scheme 字段 |
|-----|-------------|
| 仪表位号 | `instruments[].tag` |
| 功能 | `instruments[].type` (TI/FIC/LSH…) |
| 量程 | `instruments[].range` |
| 信号 | `instruments[].signal` |
| 所在管线/设备 | `instruments[].on_line` / `location` |

---

## 绘图模式 output_config.drawing_type

| 值 | 引擎 | 交付物 |
|----|------|--------|
| `pfd` | `drawing2d.build_pfd2d` | 物流号+位号+管道表 PDF |
| `pid` | `drawing_pid.build_pid2d` | P&ID + 完整管道表 + 仪表表 |
| `3d` / `model` | `equipment3d.build_plant3d` | 三维布置预览 |
| `layout` | 阶段3 | 设备布置平面图 |
| `isometric` | 阶段3 | 简化管道单线图 |

---

## 校验 API（Python）

```python
from core.scheme_schema import enrich_scheme, validate_for_pfd, validate_for_pid

scheme = enrich_scheme(json.load(...))
report = validate_for_pfd(scheme, strict=False)  # warnings
report = validate_for_pfd(scheme, strict=True)   # 缺 streams 则 errors
```

---

## 示例与验证

- PFD 样例：`examples/input/example_pfd.json`
- P&ID 样例：`examples/input/example_pid.json`
- 无头验证：`scripts/verify_r1.py`

---

## PilotDeck VDI 集成

1. CP-0 通过后，工艺 Skill 输出 scheme JSON
2. FreeCAD 面板 **JSON生成**（默认 2D PFD）或 CLI generate
3. CP-1 人类确认后进入 CP-2，补充 instruments 与完整 pipe_list
4. 导出 PDF 作为 CP 交付附件
