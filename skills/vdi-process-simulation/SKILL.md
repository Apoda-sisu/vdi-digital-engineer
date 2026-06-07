---
name: 流程模拟
code: PRSS
description: 流程模拟引擎。用户可直接调用：物性方法推荐、收敛策略指导、灵敏度分析、工况切换指导、反应器模拟、分离过程模拟、模拟结果验证。输入模拟需求即可获得方法建议，无需通过专业负责人。触发场景：流程模拟、物性方法选择、灵敏度分析、工况切换、反应器模拟、分离模拟、结果验证。
metadata:
  vdi:
    discipline: PR
    sub_discipline: S
    level: 3
    called_by:
      - 工艺路线设计基础
      - 物料热量平衡
      - 工艺设备数据表
    pilotdeck_workspace: /workspace/workspaces/工艺组
    mcp_required: [vdi-knowledge]
    standalone: false
    triggers: [流程模拟, 物性方法, 灵敏度, 工况, 反应器, 分离, 验证]
---

# 流程模拟指导专项工程师（三级）

纯模拟指导引擎。被二级 Skill 调用提供物性方法/收敛策略/灵敏度分析建议。不输出 DisciplineOutput。

## 物性方法推荐

**输入**：
```json
{
  "calc_type": "property_method",
  "system": { "components": ["CH4", "H2O", "CO", "H2", "CO2", "CH3OH"], "P_MPaG_range": [0.1, 5.0], "T_C_range": [25, 450] },
  "has_polar": true,
  "has_electrolytes": false
}
```

**输出**：
```json
{
  "recommended": "NRTL-RK",
  "alternatives": ["PRWS", "SRK"],
  "reason": "含极性组分甲醇+水，NRTL 液相活度系数 + RK 气相状态方程适用于中高压",
  "binary_params_needed": ["CH3OH-H2O", "CH4-CH3OH", "CO2-CH3OH"],
  "note": "若缺乏 NRTL 二元交互参数，可用 UNIFAC 估算"
}
```

## 物性方法速查

|| 体系特征 | 推荐方法 | 适用压力 |
||----------|---------|---------|
|| 烃类（无极性） | PR / SRK | 全压范围 |
|| 含极性（醇/水） | NRTL / Wilson | ≤ 2 MPa |
|| 含极性 + 高压 | NRTL-RK / PRWS | 全压范围 |
|| 含 H2 / 超临界 | PR / SRK-Modified | ≥ 5 MPa |
|| 电解质 | ELECNRTL | 常压 |
|| 胺法脱硫 | Kent-Eisenberg | ≤ 1 MPa |
|| 蒸汽系统 | IAPWS-IF97 / Steam-TA | ≤ 22 MPa |

## 收敛策略推荐

**输入**：
```json
{
  "calc_type": "convergence_strategy",
  "flowsheet": { "recycle_streams": 3, "design_specs": 4, "columns": 2 },
  "issues": ["recycle不收敛", "精馏塔振荡"]
}
```

**输出**：
```json
{
  "tear_streams": ["S-15 循环气", "S-28 循环甲醇"],
  "sequence": [
    "1. 先关闭 recycle，用预估值代替 → 求解单程",
    "2. 打开 recycle S-15，用 Wegstein 方法",
    "3. 精馏塔 T-201 先简化为 shortcut → 再 rigor",
    "4. 打开 recycle S-28，切换到 Broyden"
  ],
  "tolerances": { "tear": 0.0001, "column": 0.001 },
  "max_iterations": 200
}
```

## 灵敏度分析

**输入**：
```json
{
  "calc_type": "sensitivity",
  "objective": "甲醇产量最大化",
  "manipulated": ["反应温度", "反应压力", "循环比"],
  "constraints": ["CO转化率 ≥ 90%", "副产乙醇 ≤ 0.1%"]
}
```

**输出**：
```json
{
  "optimal_point": { "T_C": 245, "P_MPaG": 5.2, "recycle_ratio": 3.5 },
  "sensitivity_rank": [
    { "variable": "反应温度", "impact": "high", "range": "235-255°C 产量 ± 8%" },
    { "variable": "反应压力", "impact": "medium", "range": "4.8-5.5MPaG 产量 ± 3%" },
    { "variable": "循环比", "impact": "low", "range": "3.0-4.0 产量 ± 1.5%" }
  ],
  "trade_offs": "温度↑ → 产量↑ 但副产↑。推荐 245°C 为平衡点"
}
```

## 工况切换指导

|| 工况 | 产能 | 关键参数调整 |
||------|------|-------------|
|| 设计工况 | 100% | 基准参数 |
|| 最大工况 | 110% | 空速 ↑10%，冷却水 ↑15%，蒸汽 ↑10% |
|| 最小工况 | 60% | 循环比 ↑（维持空速），压缩机回流开 |
|| 开车工况 | 0→60% | N₂ 循环升温升压 → 切换原料气 → 逐步提负荷 |

## 反应器模拟指导

### 固定床反应器模拟

**输入**：
```json
{
  "sim_type": "fixed_bed_reactor",
  "reactor_type": "adiabatic",
  "catalyst": "Cu/ZnO/Al2O3",
  "feed_composition": { "CO": 0.15, "CO2": 0.08, "H2": 0.65, "CH3OH": 0.02, "H2O": 0.10 },
  "T_in_C": 220, "P_MPaG": 5.0,
  "GSHV_h": 8000
}
```

**输出**：
```json
{
  "recommended_model": "power_law",
  "kinetic_params": { "Ea_kJmol": 75, "n_CO": 0.5, "n_H2": 1.0 },
  "convergence_strategy": "successive_substitution",
  "mesh_recommendation": "axial_10_points",
  "sensitivity_variables": ["T_in", "P", "GSHV"],
  "expected_conversion_pct": 25,
  "verdict": "固定床反应器，建议使用幂律动力学模型"
}
```

### 流化床反应器模拟

**输入**：
```json
{
  "sim_type": "fluidized_bed_reactor",
  "particle_size_um": 500,
  "particle_density_kgm3": 1500,
  "gas_velocity_ms": 0.1,
  "bed_height_m": 2.0,
  "reaction": "Fischer-Tropsch synthesis"
}
```

**输出**：
```json
{
  "fluidization_regime": "bubbling",
  "bubble_diameter_m": 0.05,
  "gas_backmixing": "significant",
  "recommended_model": "two_phase",
  "verdict": "鼓泡流化床，需考虑气泡相和乳化相"
}
```

### 搅拌反应器模拟

**输入**：
```json
{
  "sim_type": "stirred_reactor",
  "reactor_type": "CSTR",
  "volume_m3": 10,
  "agitation_speed_rpm": 200,
  "impeller_type": "rushton",
  "reaction": "acid-base neutralization"
}
```

**输出**：
```json
{
  "mixing_regime": "well_mixed",
  "power_consumption_kW": 5.5,
  "reynolds_number": 50000,
  "recommended_model": "perfect_mixing",
  "verdict": "全混流模型适用，搅拌功率充足"
}
```

## 分离过程模拟指导

### 精馏塔模拟

**输入**：
```json
{
  "sim_type": "distillation_column",
  "feed_composition": { "methanol": 0.4, "water": 0.6 },
  "feed_T_C": 65, "feed_P_MPaG": 0.15,
  "target_purity_pct": 99.5,
  "reflux_ratio": 2.5,
  "number_of_stages": 35
}
```

**输出**：
```json
{
  "recommended_method": "NRTL",
  "convergence_algorithm": "inside_out",
  "specification_type": "distillate_rate",
  "sensitivity_variables": ["reflux_ratio", "feed_stage"],
  "expected_purity_pct": 99.8,
  "reboiler_duty_kW": 850,
  "verdict": "甲醇-水体系，NRTL模型适用"
}
```

### 吸收塔模拟

**输入**：
```json
{
  "sim_type": "absorber",
  "gas_composition": { "CO2": 0.15, "N2": 0.85 },
  "absorbent": "MEA 30wt%",
  "gas_flow_kgmolh": 1000,
  "liquid_gas_ratio": 3.5,
  "number_of_stages": 20
}
```

**输出**：
```json
{
  "recommended_method": "ELECNRTL",
  "reaction_equilibrium": "CO2 + 2MEA → MEACOO- + MEAH+",
  "mass_transfer_coefficient": "Onda correlation",
  "expected_recovery_pct": 95,
  "solvent_circulation_rate_kgm3h": 50,
  "verdict": "胺法脱碳，需考虑化学吸收"
}
```

## 反应-分离耦合模拟

### 反应精馏模拟

**输入**：
```json
{
  "sim_type": "reactive_distillation",
  "reaction": "esterification: acetic acid + ethanol ↔ ethyl acetate + water",
  "catalyst": "Amberlyst-15",
  "number_of_stages": 30,
  "reactive_stages": [10, 25],
  "feed_ratio_acid_ethanol": 1.0
}
```

**输出**：
```json
{
  "recommended_model": "equilibrium_stage",
  "catalyst_activity_model": "langmuir_hinshelwood",
  "convergence_strategy": "simultaneous_correction",
  "sensitivity_variables": ["feed_ratio", "reflux_ratio", "catalyst_loading"],
  "expected_conversion_pct": 85,
  "verdict": "反应精馏，需考虑反应与分离的耦合效应"
}
```

## 模拟结果验证指导

### 数据一致性检查

**输入**：
```json
{
  "check_type": "data_consistency",
  "streams": [
    { "id": "S1", "flow_kgmolh": 100, "T_C": 200, "P_MPaG": 5.0 },
    { "id": "S2", "flow_kgmolh": 120, "T_C": 180, "P_MPaG": 4.8 }
  ],
  "balance_closure_error_pct": 2.5
}
```

**输出**：
```json
{
  "mass_balance_check": "pass",
  "energy_balance_check": "pass",
  "component_balance_check": "pass",
  "closure_error_assessment": "acceptable",
  "verdict": "数据一致性检查通过，闭合误差2.5%在允许范围内"
}
```

### 敏感性分析指导

**输入**：
```json
{
  "analysis_type": "sensitivity",
  "objective": "maximize methanol yield",
  "manipulated_variables": ["T_reactor", "P_reactor", "recycle_ratio"],
  "constraints": ["CO_conversion > 90%", "ethanol_byproduct < 0.1%"]
}
```

**输出**：
```json
{
  "optimal_conditions": { "T_C": 245, "P_MPaG": 5.2, "recycle_ratio": 3.5 },
  "sensitivity_ranking": [
    { "variable": "T_reactor", "impact": "high", "range": "235-255°C" },
    { "variable": "P_reactor", "impact": "medium", "range": "4.8-5.5MPaG" },
    { "variable": "recycle_ratio", "impact": "low", "range": "3.0-4.0" }
  ],
  "trade_offs": "温度↑ → 产量↑ 但副产↑，推荐245°C为平衡点",
  "verdict": "敏感性分析完成，温度影响最大"
}
```

---

**版本**：V2.0（三级专项）  
**更新日期**：2026-06-05