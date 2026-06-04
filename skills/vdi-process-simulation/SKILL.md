---
name: 流程模拟
code: PRSS
description: 流程模拟引擎。用户可直接调用：物性方法推荐、收敛策略指导、灵敏度分析、工况切换指导。输入模拟需求即可获得方法建议，无需通过专业负责人。触发场景：流程模拟、物性方法选择、灵敏度分析、工况切换。
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
    triggers: [流程模拟, 物性方法, 灵敏度, 工况]
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

| 体系特征 | 推荐方法 | 适用压力 |
|----------|---------|---------|
| 烃类（无极性） | PR / SRK | 全压范围 |
| 含极性（醇/水） | NRTL / Wilson | ≤ 2 MPa |
| 含极性 + 高压 | NRTL-RK / PRWS | 全压范围 |
| 含 H2 / 超临界 | PR / SRK-Modified | ≥ 5 MPa |
| 电解质 | ELECNRTL | 常压 |
| 胺法脱硫 | Kent-Eisenberg | ≤ 1 MPa |
| 蒸汽系统 | IAPWS-IF97 / Steam-TA | ≤ 22 MPa |

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

| 工况 | 产能 | 关键参数调整 |
|------|------|-------------|
| 设计工况 | 100% | 基准参数 |
| 最大工况 | 110% | 空速 ↑10%，冷却水 ↑15%，蒸汽 ↑10% |
| 最小工况 | 60% | 循环比 ↑（维持空速），压缩机回流开 |
| 开车工况 | 0→60% | N₂ 循环升温升压 → 切换原料气 → 逐步提负荷 |

---

**版本**：V1.0（三级专项）  
**更新日期**：2026-05-30
