---
name: 给排水水力计算
code: WAHC
description: 给排水水力计算引擎。用户可直接调用：管径计算、水头损失、最不利点压力校核、排水管道水力计算。输入流量和管段参数即可获得计算结果，无需通过专业负责人。触发场景：管径计算、水头损失、压力校核、排水水力。
metadata:
  vdi:
    discipline: WA
    sub_discipline: H
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

本 Skill 是**纯计算引擎**，被二级 Skill（supply/fire/drainage 等）调用执行原子水力计算。不接收设计任务，不输出 DisciplineOutput，不引用规范。

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

### 给水管道（海曾-威廉姆斯公式）
```
Hf = 10.67 × L × Q^1.852 / (C^1.852 × D^4.87)
D: 管径 (m), Q: 流量 (m³/s), L: 长度 (m), C: 系数（球墨铸铁=130, 钢管=120, PE=140）
```

### 排水管道（曼宁公式）
```
V = (1/n) × R^(2/3) × S^(1/2)
Q = A × V
n: 粗糙系数（混凝土=0.013, HDPE=0.009）, R: 水力半径, S: 坡度
```

### 局部水头损失
```
Hl = Σζ × V²/(2g)
ζ: 局部阻力系数，常规取沿程损失的 20-30%
```

## 常用参数速查

| 管材 | C 值（海曾-威廉姆斯） | n 值（曼宁） | 经济流速 (m/s) |
|------|---------------------|-------------|---------------|
| 球墨铸铁 | 130 | - | 1.5-2.0 (DN50-100) |
| 钢管 | 120 | - | 1.5-2.5 |
| PE/HDPE | 140 | 0.009 | 1.0-1.8 |
| 混凝土管 | - | 0.013 | 0.6-1.0 (污水), 0.75-1.5 (雨水) |
| UPVC | 140 | 0.009 | 1.0-1.5 |

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
