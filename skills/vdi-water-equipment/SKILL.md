---
name: 给排水设备选型
code: WAEE
description: 给排水设备选型引擎。用户可直接调用：水泵选型（给水泵/消防泵/排水泵）、冷却塔选型、构筑物尺寸估算。输入设备参数即可获得选型结果，无需通过专业负责人。触发场景：水泵选型、设备参数匹配、冷却塔选型、构筑物尺寸。
metadata:
  vdi:
    discipline: WA
    sub_discipline: E
    role: 执行层
    level: 3
    called_by:
      - 给水系统设计
      - 消防给水设计
      - 排水系统设计
      - 污水处理设计
      - 循环水系统设计
    pilotdeck_workspace: /workspace/workspaces/给排水组
    mcp_required:
      - vdi-knowledge
    standalone: false
    triggers:
      - 水泵选型
      - 设备参数
      - 构筑物尺寸
---

# 设备选型专项工程师（三级）

## 角色定位

本 Skill 是**公式调度器 + 选型引擎**，被二级 Skill 调用执行设备参数匹配和构筑物尺寸估算。功率计算等数值计算通过 `vdi-knowledge` MCP 的公式工具执行，禁止脑算。不接收设计任务，不输出 DisciplineOutput。

## 输入/输出协议

### 给水泵选型

**输入**：
```json
{
  "equip_type": "water_supply_pump",
  "flow_m3h": 45,
  "head_m": 42,
  "fluid": "清水",
  "continuous_operation": true
}
```

**输出**：
```json
{
  "pump_type": "单级双吸离心泵",
  "model_suggestion": "KQW 150/315-30/4 或同等",
  "rated_flow_m3h": 50,
  "rated_head_m": 44,
  "motor_power_kW": 11,
  "efficiency_pct": 78,
  "npshr_m": 2.8,
  "standby_count": 1,
  "note": "建议 1 用 1 备，变频控制"
}
```

### 消防泵选型

**输入**：
```json
{
  "equip_type": "fire_pump",
  "flow_Ls": 95,
  "head_m": 85,
  "standard": "GB 50974-2014"
}
```

**输出**：
```json
{
  "pump_type": "卧式多级消防泵",
  "model_suggestion": "XBD 10/100 或同等",
  "rated_flow_Ls": 100,
  "rated_head_m": 90,
  "motor_power_kW": 132,
  "standby_count": 1,
  "note": "消防泵 1 用 1 备，设自动巡检装置。柴油机备用泵建议另配。"
}
```

### 排水泵选型

**输入**：
```json
{
  "equip_type": "sewage_pump",
  "flow_Ls": 10,
  "head_m": 12,
  "fluid": "含油废水",
  "submersible": true
}
```

**输出**：
```json
{
  "pump_type": "潜水排污泵",
  "model_suggestion": "WQ 50-15-4 或同等",
  "rated_flow_m3h": 40,
  "rated_head_m": 15,
  "motor_power_kW": 4,
  "standby_count": 1,
  "note": "2 台（1 用 1 备），带自动耦合装置，集水池有效容积 ≥ 单泵 5min 流量"
}
```

### 处理构筑物尺寸

**输入**：
```json
{
  "equip_type": "aeration_tank",
  "flow_m3d": 500,
  "bod_in_mgL": 350,
  "bod_out_mgL": 10,
  "mlss_mgL": 3500,
  "f_m_ratio": 0.15
}
```

**输出**：
```json
{
  "tank_type": "推流式曝气池",
  "volume_m3": 340,
  "hrt_h": 16.3,
  "dimensions": { "length_m": 18, "width_m": 6, "depth_m": 3.2 },
  "aeration_requirement_kgO2_d": 125,
  "diffuser_count": 85,
  "return_sludge_ratio": 0.8,
  "note": "有效水深 3.2m（含 0.5m 超高），分 2 格并联运行"
}
```

### 冷却塔选型

**输入**：
```json
{
  "equip_type": "cooling_tower",
  "flow_m3h": 2000,
  "hot_water_temp_C": 42,
  "cold_water_temp_C": 32,
  "wet_bulb_temp_C": 28
}
```

**输出**：
```json
{
  "tower_type": "开式逆流机械通风",
  "single_capacity_m3h": 800,
  "unit_count": 3,
  "total_capacity_m3h": 2400,
  "margin_pct": 20,
  "dimensions_per_unit": { "length_m": 6, "width_m": 6, "height_m": 5.5 },
  "spacing_m": 10,
  "note": "3 台 × 800m³/h（2 用 1 备），间距 ≥ 1.5 倍直径"
}
```

## 计算方法

> **所有数值计算必须通过 `vdi_calculate` MCP 工具执行，禁止脑算。**

### 常用公式

| 计算场景 | 公式 ID | 说明 |
|----------|---------|------|
| 水泵轴功率 | WA-EQ-001 | P = ρgQH/η |
| 水泵电机功率 | WA-EQ-002 | Pm = P/ηm |
| 消防水池容积 | WA-FIR-001 | V = (Qf-Qb)×T |

### 调用流程

1. 根据设备类型查找上表对应的公式 ID
2. 调用 `vdi_calculate(formula_id="<ID>", inputs={...})` 执行计算
3. 将计算结果中的 `audit.evidence_tag` 写入选型报告

### 调用示例

```
# 水泵轴功率
vdi_calculate(formula_id="WA-EQ-001", inputs={ρ: 1000, g: 9.81, Q: 0.0125, H: 42, η: 0.75})

# 水泵电机功率
vdi_calculate(formula_id="WA-EQ-002", inputs={P: 18.34, ηm: 0.9})
```

## 选型原则

| 设备 | 选型要点 |
|------|----------|
| 给水泵 | 流量按最大时，扬程含几何高差+水头损失+自由水头。备用率 50-100% |
| 消防泵 | 流量按设计消防流量，扬程满足最不利点压力。1 用 1 备，不得使用变频 |
| 排水泵 | 潜水式优先。集水池容积 ≥ 单泵 5min 流量。备用同型号 |
| 曝气池 | BOD 污泥负荷 0.1-0.2 kgBOD/kgMLSS·d，MLSS 3000-4000 mg/L |
| 二沉池 | 表面负荷 0.6-1.0 m³/m²·h（活性污泥法），固体通量 ≤ 150 kg/m²·d |
| 冷却塔 | 单塔 ≤ 4000m³/h，台数 ≥ 2。间距 ≥ 塔直径 1.5 倍 |

## 使用方式

二级 Skill 在对话中调用：
```
/给排水设备选型

请选型消防泵：
- equip_type: fire_pump
- flow_Ls: 95
- head_m: 85
- standard: GB 50974-2014
```

---

**版本**：V1.0（三级专项）  
**更新日期**：2026-05-30
