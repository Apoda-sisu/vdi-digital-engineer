---
name: 给排水水力计算
code: WAHC
description: 给排水水力计算引擎。用户可直接调用：管径计算、水头损失、最不利点压力校核、排水管道水力计算。输入流量和管段参数即可获得计算结果，无需通过专业负责人。触发场景：管径计算、水头损失、压力校核、排水水力。
metadata:
  vdi:
    discipline: WA
    sub_discipline: H
    role: 执行层
    level: 3
    called_by:
      - 给水系统设计
      - 消防给水设计
      - 排水系统设计
      - 雨水系统设计
      - 循环水系统设计
    pilotdeck_workspace: /workspace/workspaces/给排水组
    mcp_required:
      - vdi-knowledge
    standalone: false
    triggers:
      - 管径计算
      - 水头损失
      - 压力校核
      - 排水水力
---

# 水力计算专项工程师（三级）

## 角色定位

本 Skill 是**公式调度器**，被二级 Skill（supply/fire/drainage 等）调用执行原子水力计算。所有计算通过 `vdi-knowledge` MCP 的公式工具（`vdi_search_formulas` → `vdi_calculate`）执行，禁止脑算。不接收设计任务，不输出 DisciplineOutput。

## 输入/输出协议

### 给水管道计算

**输入**：
```json
{
  "calc_type": "water_supply_pipe",
  "flow_Ls": 12.5,
  "pipe_material": "ductile_iron",
  "layout": "loop",
  "constraints": { "max_velocity_ms": 2.0, "min_pressure_MPa": 0.15 }
}
```

**输出**：
```json
{
  "diameter_dn": 100,
  "inner_diameter_mm": 100,
  "velocity_ms": 1.59,
  "unit_headloss_m_km": 25.4,
  "recommendation": "DN100 满足经济流速要求，水头损失在合理范围"
}
```

### 消防管道计算

**输入**：
```json
{
  "calc_type": "fire_pipe",
  "flow_Ls": 95,
  "layout": "loop",
  "safety_factor": 1.15
}
```

**输出**：
```json
{
  "diameter_dn": 200,
  "velocity_ms": 3.02,
  "unit_headloss_m_km": 52.8,
  "total_headloss_m": 6.3,
  "note": "消防时流速可放宽至 3.5m/s，DN200 满足要求"
}
```

### 排水管道计算

**输入**：
```json
{
  "calc_type": "gravity_drain",
  "flow_Ls": 8.5,
  "pipe_material": "hdpe",
  "constraints": { "max_fullness": 0.6, "min_velocity_ms": 0.6 }
}
```

**输出**：
```json
{
  "diameter_dn": 250,
  "slope": 0.003,
  "fullness": 0.48,
  "velocity_ms": 0.82,
  "capacity_Ls": 14.2,
  "recommendation": "DN250，坡度 0.003，满足最小流速要求，预留 67% 余量"
}
```

### 最不利点压力校核

**输入**：
```json
{
  "calc_type": "worst_point_pressure",
  "source_pressure_MPa": 0.45,
  "elevation_diff_m": 15,
  "pipe_length_m": 350,
  "flow_Ls": 12.5,
  "fittings_factor": 1.3
}
```

**输出**：
```json
{
  "static_head_m": 15,
  "friction_loss_m": 11.5,
  "local_loss_m": 3.5,
  "total_headloss_m": 30,
  "residual_pressure_MPa": 0.156,
  "pass": true,
  "note": "最不利点剩余压力 0.156MPa > 0.10MPa，满足要求"
}
```

## 计算方法

> **所有计算必须通过 `vdi_calculate` MCP 工具执行，禁止脑算。**

### 调用流程

1. 根据 `calc_type` 查找下表对应的公式 ID
2. 调用 `vdi_search_formulas(query="<公式名称>", discipline="water")` 确认公式存在
3. 调用 `vdi_calculate(formula_id="<ID>", inputs={...}, input_units={...})` 执行计算
4. 如需查表参数（C 值、n 值），MCP 通过 `look_up` 机制自动从参数表获取
5. 检查返回的 `validation.warnings`，如有警告则人工确认
6. 将 `audit.evidence_tag` 写入输出

### calc_type → 公式 ID 映射

| calc_type | 公式 ID | 说明 |
|-----------|---------|------|
| water_supply_pipe | WA-HYD-001 | 海曾-威廉姆斯沿程水头损失 |
| gravity_drain | WA-HYD-002 + WA-HYD-003 | 曼宁公式 + 流量公式 |
| fire_pipe | WA-HYD-001 | 消防管道（同给水） |
| worst_point_pressure | WA-HYD-001 + WA-HYD-005 | 沿程 + 局部水头损失 |
| pump_power | WA-EQ-001 | 水泵轴功率 |

### 调用示例

```
# 给水管道水头损失
vdi_calculate(formula_id="WA-HYD-001", inputs={L: 350, Q: 0.0125, C: 130, D: 0.1})

# 排水管道流速
vdi_calculate(formula_id="WA-HYD-002", inputs={n: 0.009, R: 0.0625, S: 0.003})

# 局部水头损失
vdi_calculate(formula_id="WA-HYD-005", inputs={Hf: 11.5, k: 0.25})
```

## 使用方式

二级 Skill 在对话中调用：
```
/给排水水力计算

请计算排水管道：
- calc_type: gravity_drain
- flow_Ls: 8.5
- pipe_material: hdpe
- constraints: max_fullness=0.6, min_velocity_ms=0.6
```

三级 Skill 返回计算结果后，二级 Skill 将结果整合到自己的 DisciplineOutput 中。

---

**版本**：V1.0（三级专项）  
**更新日期**：2026-05-30
