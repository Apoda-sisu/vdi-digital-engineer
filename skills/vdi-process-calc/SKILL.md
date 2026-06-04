---
name: 工艺计算
code: PRCC
description: 工艺计算引擎。用户可直接调用：物料平衡、热量平衡、设备尺寸（反应器/塔/换热器/泵）、管径估算、安全阀泄放量计算。输入工艺参数即可获得计算结果，无需通过专业负责人。触发场景：物料平衡、热量平衡、设备尺寸、管径估算、安全阀计算。
metadata:
  vdi:
    discipline: PR
    sub_discipline: C
    level: 3
    called_by:
      - 工艺路线设计基础
      - 物料热量平衡
      - PFD-PID设计
      - 工艺设备数据表
      - 工艺安全分析
      - 公用工程排放
    pilotdeck_workspace: /workspace/workspaces/工艺组
    mcp_required: [vdi-knowledge]
    standalone: false
    triggers: [物料平衡, 热量平衡, 设备尺寸, 管径, 安全阀]
---

# 工艺计算专项工程师（三级）

纯计算引擎。被二级 Skill 调用执行原子工艺计算，不输出 DisciplineOutput。

## 物料平衡计算

**输入**：
```json
{
  "calc_type": "material_balance",
  "feed": { "flow_kgh": 71429, "composition": { "CH4": 0.92, "C2H6": 0.05, "CO2": 0.03 } },
  "reactions": [{ "equation": "CH4 + H2O → CO + 3H2", "conversion": 0.95 }],
  "separations": [{ "component": "CH3OH", "recovery_pct": 99 }]
}
```

**输出**：
```json
{
  "streams": [
    { "id": "F-001", "name": "天然气进料", "flow_kgh": 71429, "composition": {} },
    { "id": "P-001", "name": "甲醇产品", "flow_kgh": 37500, "purity_wt_pct": 99.9 }
  ],
  "closure_error_pct": 0.3,
  "verdict": "pass"
}
```

## 热量平衡计算

**输入**：
```json
{
  "calc_type": "heat_balance",
  "unit": "甲醇合成回路",
  "reaction_heat_kJkg": 2450,
  "streams_enthalpy": [
    { "stream": "F-001", "T_C": 220, "H_kJh": 15200000 }
  ],
  "targets": { "preheat_reactor_feed_C": 220, "cool_product_to_C": 40 }
}
```

**输出**：
```json
{
  "heat_duties": [
    { "exchanger": "E-301", "duty_MW": 24.5, "type": "feed-effluent" },
    { "exchanger": "E-302", "duty_MW": 18.2, "type": "product cooler" }
  ],
  "steam_generation": { "pressure_MPaG": 4.0, "flow_th": 12.4 },
  "energy_efficiency_pct": 61
}
```

## 反应器尺寸计算

**输入**：
```json
{
  "calc_type": "reactor_sizing",
  "feed_flow_Nm3h": 100000,
  "catalyst": { "bulk_density_kgm3": 1200, "void_fraction": 0.4 },
  "ghsv_h": 3500,
  "constraints": { "max_diameter_mm": 4000, "max_pressure_drop_kPa": 50 }
}
```

**输出**：
```json
{
  "catalyst_volume_m3": 28.6,
  "bed_dimensions": { "diameter_mm": 3200, "height_mm": 3560 },
  "vessel_dimensions": { "id_mm": 3400, "tan_tan_mm": 8500 },
  "pressure_drop_kPa": 35,
  "verdict": "满足约束（直径<4000mm，压降<50kPa）"
}
```

## 精馏塔尺寸计算

**输入**：
```json
{
  "calc_type": "column_sizing",
  "vapor_load_kgh": 45000, "liquid_load_kgh": 38000,
  "rho_v_kgm3": 2.8, "rho_l_kgm3": 780,
  "tray_spacing_mm": 600, "flooding_pct": 80
}
```

**输出**：
```json
{
  "diameter_mm": 2400, "tower_height_mm": 28000,
  "actual_trays": 35, "feed_tray": 18, "tray_efficiency_pct": 65,
  "design_pct_flooding": 76
}
```

## 换热器面积计算

**输入**：
```json
{
  "calc_type": "exchanger_sizing",
  "duty_MW": 24.5,
  "hot_side": { "T_in_C": 280, "T_out_C": 180, "fluid": "合成气" },
  "cold_side": { "T_in_C": 40, "T_out_C": 220, "fluid": "锅炉给水" },
  "type": "shell_and_tube", "estimated_u_Wm2K": 450
}
```

**输出**：
```json
{
  "area_m2": 1020, "delta_T_lmtd_C": 53.3,
  "configuration": "BEM", "shell_diameter_mm": 900,
  "tube_count": 780, "tube_length_mm": 6000, "tube_od_mm": 19.05,
  "excess_area_pct": 15
}
```

## 泵扬程计算

**输入**：
```json
{
  "calc_type": "pump_head",
  "flow_m3h": 85, "suction_P_MPaG": 0.15,
  "discharge_P_MPaG": 1.8, "elevation_diff_m": 12,
  "pipe_length_m": 85, "fittings_count": 8
}
```

**输出**：
```json
{
  "static_head_m": 12, "pressure_head_m": 168,
  "friction_head_m": 5.5, "fittings_head_m": 2.1,
  "control_valve_dp_m": 5, "total_head_m": 192.6,
  "npsha_m": 4.5, "recommended_motor_kW": 75
}
```

## 安全阀泄放量（API 521 火灾工况）

**输入**：
```json
{
  "calc_type": "psv_fire",
  "vessel_type": "horizontal",
  "id_mm": 3200, "tan_tan_mm": 8500,
  "liquid_level_pct": 80, "design_P_MPaG": 3.0,
  "fluid": { "latent_heat_kJkg": 350, "molwt": 32 }
}
```

**输出**：
```json
{
  "wetted_area_m2": 68.3,
  "relief_load_kgh": 12500, "required_orifice_mm2": 1840,
  "selected_orifice": "L", "inlet_dn": 80, "outlet_dn": 100,
  "set_pressure_MPaG": 3.0
}
```

---

**版本**：V1.0（三级专项）  
**更新日期**：2026-05-30
