---
name: 工艺计算
code: PRCC
description: 工艺计算引擎。用户可直接调用：物料平衡、热量平衡、设备尺寸（反应器/塔/换热器/泵）、管径估算、安全阀泄放量计算、催化剂相关计算、反应器设计计算。输入工艺参数即可获得计算结果，无需通过专业负责人。触发场景：物料平衡、热量平衡、设备尺寸、管径估算、安全阀计算、催化剂计算、反应器设计。
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
    triggers: [物料平衡, 热量平衡, 设备尺寸, 管径, 安全阀, 催化剂, 反应器]
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

## 催化剂相关计算

### 催化剂空时收率计算

**输入**：
```json
{
  "calc_type": "catalyst_sty",
  "product_flow_kgh": 5000,
  "catalyst_weight_kg": 2500,
  "bed_volume_m3": 2.5
}
```

**输出**：
```json
{
  "sty_kg_kg_h": 0.8,
  "catalyst_productivity": "中等",
  "verdict": "催化剂活性正常"
}
```

### 催化剂失活动力学计算

**输入**：
```json
{
  "calc_type": "catalyst_deactivation",
  "deactivation_rate_h": 0.001,
  "operation_time_h": 500
}
```

**输出**：
```json
{
  "activity": 0.607,
  "remaining_life_pct": 60.7,
  "verdict": "催化剂活性衰减至60.7%"
}
```

### 催化剂选择性计算

**输入**：
```json
{
  "calc_type": "catalyst_selectivity",
  "product_mol": 100,
  "product_molwt": 32,
  "reactant_mol": 120,
  "reactant_molwt": 16
}
```

**输出**：
```json
{
  "selectivity_pct": 166.7,
  "verdict": "选择性异常，需检查数据"
}
```

## 反应器设计计算

### 固定床反应器压降计算（Ergun方程）

**输入**：
```json
{
  "calc_type": "fixed_bed_pressure_drop",
  "viscosity_Pa_s": 1e-5,
  "void_fraction": 0.4,
  "particle_diameter_m": 0.003,
  "fluid_density_kgm3": 10,
  "superficial_velocity_ms": 0.5,
  "bed_length_m": 5
}
```

**输出**：
```json
{
  "pressure_drop_Pa_m": 1250,
  "total_pressure_drop_kPa": 6.25,
  "verdict": "压降在可接受范围内"
}
```

### 流化床最小流化速度计算

**输入**：
```json
{
  "calc_type": "minimum_fluidization",
  "particle_diameter_m": 0.0005,
  "particle_density_kgm3": 1500,
  "fluid_density_kgm3": 1.2,
  "viscosity_Pa_s": 1.8e-5
}
```

**输出**：
```json
{
  "umf_ms": 0.003,
  "regime": "层流区",
  "verdict": "最小流化速度0.003 m/s"
}
```

### 管式反应器停留时间计算

**输入**：
```json
{
  "calc_type": "pfr_residence_time",
  "reactor_diameter_m": 0.1,
  "reactor_length_m": 10,
  "volumetric_flow_m3s": 0.001
}
```

**输出**：
```json
{
  "reactor_volume_m3": 0.0785,
  "residence_time_s": 78.5,
  "verdict": "停留时间78.5秒"
}
```

### 全混流反应器设计计算

**输入**：
```json
{
  "calc_type": "cstr_design",
  "volumetric_flow_m3s": 0.001,
  "feed_concentration_molm3": 100,
  "conversion": 0.9,
  "reaction_rate_molm3s": 0.5
}
```

**输出**：
```json
{
  "reactor_volume_m3": 0.18,
  "residence_time_s": 180,
  "verdict": "反应器体积0.18 m³"
}
```

## 催化剂物理性质计算

### 催化剂比表面积计算

**输入**：
```json
{
  "calc_type": "catalyst_surface_area",
  "adsorbed_gas_volume_cm3": 50,
  "molecular_cross_section_m2": 0.162e-18,
  "catalyst_weight_g": 1.0
}
```

**输出**：
```json
{
  "surface_area_m2g": 218,
  "verdict": "比表面积218 m²/g"
}
```

### 催化剂孔容计算

**输入**：
```json
{
  "calc_type": "catalyst_pore_volume",
  "water_absorption_g": 0.5,
  "catalyst_weight_g": 1.0
}
```

**输出**：
```json
{
  "pore_volume_mLg": 0.5,
  "verdict": "孔容0.5 mL/g"
}
```

### 催化剂平均孔径计算

**输入**：
```json
{
  "calc_type": "catalyst_pore_diameter",
  "pore_volume_mLg": 0.5,
  "surface_area_m2g": 218
}
```

**输出**：
```json
{
  "pore_diameter_nm": 9.2,
  "verdict": "平均孔径9.2 nm"
}
```

---

**版本**：V1.0（三级专项）  
**更新日期**：2026-05-30
