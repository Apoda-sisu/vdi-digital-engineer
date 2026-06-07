---
name: 工艺数据管理
code: PRDM
description: 工艺数据管理工程师。管理工艺设计数据版本、数据一致性检查、数据追溯、数据备份恢复。触发场景：数据版本管理、数据一致性检查、数据追溯、数据备份、数据恢复。
metadata:
  vdi:
    discipline: PR
    sub_discipline: DM
    level: 3
    called_by:
      - 工艺专业负责人
      - 工艺路线设计基础
      - 物料热量平衡
      - PFD-PID设计
      - 工艺设备数据表
    pilotdeck_workspace: /workspace/workspaces/工艺组
    mcp_required: [vdi-knowledge]
    standalone: false
    triggers: [数据版本, 数据一致性, 数据追溯, 数据备份, 数据恢复]
---

# 工艺数据管理工程师（三级）

纯数据管理引擎。被二级 Skill 调用提供数据版本管理/一致性检查/追溯/备份恢复服务。不输出 DisciplineOutput。

## 数据版本管理

### 创建数据版本

**输入**：
```json
{
  "operation": "create_version",
  "data_type": "material_balance",
  "project_id": "PRJ-2026-001",
  "version_label": "v1.2",
  "change_description": "调整反应器温度从220°C到225°C",
  "author": "工艺工程师A"
}
```

**输出**：
```json
{
  "version_id": "VER-PRJ-2026-001-MB-001",
  "created_at": "2026-06-05T14:30:00Z",
  "checksum": "a1b2c3d4e5f6",
  "parent_version": "v1.1",
  "status": "active",
  "verdict": "版本v1.2创建成功"
}
```

### 版本比较

**输入**：
```json
{
  "operation": "compare_versions",
  "project_id": "PRJ-2026-001",
  "version_a": "v1.1",
  "version_b": "v1.2",
  "data_type": "material_balance"
}
```

**输出**：
```json
{
  "differences": [
    {
      "field": "reactor_temperature",
      "old_value": "220°C",
      "new_value": "225°C",
      "change_pct": 2.27
    },
    {
      "field": "reactor_conversion",
      "old_value": "95%",
      "new_value": "96%",
      "change_pct": 1.05
    }
  ],
  "summary": "温度提高5°C，转化率提高1%",
  "impact_analysis": "产品产量增加约2%，能耗增加约1.5%",
  "verdict": "版本差异分析完成"
}
```

### 版本历史查询

**输入**：
```json
{
  "operation": "version_history",
  "project_id": "PRJ-2026-001",
  "data_type": "material_balance",
  "limit": 10
}
```

**输出**：
```json
{
  "versions": [
    { "version": "v1.2", "date": "2026-06-05", "author": "工艺工程师A", "description": "调整反应器温度" },
    { "version": "v1.1", "date": "2026-06-04", "author": "工艺工程师B", "description": "更新催化剂参数" },
    { "version": "v1.0", "date": "2026-06-03", "author": "工艺工程师A", "description": "初始版本" }
  ],
  "total_versions": 3,
  "verdict": "版本历史查询完成"
}
```

## 数据一致性检查

### 物料平衡一致性

**输入**：
```json
{
  "check_type": "material_balance_consistency",
  "project_id": "PRJ-2026-001",
  "streams": [
    { "id": "S1", "flow_kgmolh": 100, "composition": { "CH4": 0.9, "H2O": 0.1 } },
    { "id": "S2", "flow_kgmolh": 120, "composition": { "CO": 0.3, "H2": 0.7 } },
    { "id": "S3", "flow_kgmolh": 80, "composition": { "CH3OH": 0.95, "H2O": 0.05 } }
  ],
  "tolerance_pct": 2.0
}
```

**输出**：
```json
{
  "mass_closure_error_pct": 1.5,
  "component_errors": {
    "CH4": 0.0,
    "H2O": 0.2,
    "CO": 0.0,
    "H2": 0.1,
    "CH3OH": 0.0
  },
  "status": "pass",
  "verdict": "物料平衡一致性检查通过，闭合误差1.5%在允许范围内"
}
```

### 能量平衡一致性

**输入**：
```json
{
  "check_type": "energy_balance_consistency",
  "project_id": "PRJ-2026-001",
  "unit": "reactor_system",
  "heat_duties": {
    "reaction_heat_kw": 5000,
    "heat_loss_kw": 200,
    "cooling_duty_kw": 5200
  },
  "tolerance_pct": 3.0
}
```

**输出**：
```json
{
  "energy_closure_error_pct": 2.0,
  "heat_balance": {
    "in": 5000,
    "out": 5200 + 200,
    "difference": 0
  },
  "status": "pass",
  "verdict": "能量平衡一致性检查通过"
}
```

### 设计参数一致性

**输入**：
```json
{
  "check_type": "design_parameter_consistency",
  "project_id": "PRJ-2026-001",
  "parameters": [
    { "name": "reactor_temperature", "value": 225, "unit": "°C", "source": "process_simulation" },
    { "name": "reactor_temperature", "value": 225, "unit": "°C", "source": "equipment_data_sheet" },
    { "name": "reactor_temperature", "value": 220, "unit": "°C", "source": "pfd_document" }
  ]
}
```

**输出**：
```json
{
  "inconsistencies": [
    {
      "parameter": "reactor_temperature",
      "sources": ["process_simulation", "equipment_data_sheet", "pfd_document"],
      "values": [225, 225, 220],
      "deviation": "pfd_document比其他来源低5°C",
      "recommendation": "统一为225°C"
    }
  ],
  "status": "warning",
  "verdict": "发现1处设计参数不一致"
}
```

## 数据追溯

### 数据来源追溯

**输入**：
```json
{
  "operation": "trace_origin",
  "project_id": "PRJ-2026-001",
  "data_item": "reactor_conversion",
  "target_value": 96
}
```

**输出**：
```json
{
  "trace_chain": [
    { "step": 1, "source": "lab_test", "date": "2026-05-20", "value": 94, "confidence": 0.95 },
    { "step": 2, "source": "simulation", "date": "2026-05-25", "value": 95, "confidence": 0.90 },
    { "step": 3, "source": "design_basis", "date": "2026-06-01", "value": 96, "confidence": 0.85 }
  ],
  "origin_source": "lab_test",
  "origin_date": "2026-05-20",
  "verdict": "数据追溯完成，最终值96%来源于设计基础文件"
}
```

### 变更影响追溯

**输入**：
```json
{
  "operation": "trace_impact",
  "project_id": "PRJ-2026-001",
  "change_item": "reactor_temperature",
  "change_from": 220,
  "change_to": 225
}
```

**输出**：
```json
{
  "affected_items": [
    { "item": "reactor_conversion", "impact": "increase 1%", "dependency": "direct" },
    { "item": "product_yield", "impact": "increase 2%", "dependency": "direct" },
    { "item": "cooling_duty", "impact": "increase 5%", "dependency": "direct" },
    { "item": "energy_consumption", "impact": "increase 1.5%", "dependency": "indirect" },
    { "item": "product_purity", "impact": "no change", "dependency": "indirect" }
  ],
  "critical_paths": ["reactor_temperature → reactor_conversion → product_yield"],
  "verdict": "变更影响追溯完成，5个相关项受影响"
}
```

## 数据备份与恢复

### 创建数据备份

**输入**：
```json
{
  "operation": "create_backup",
  "project_id": "PRJ-2026-001",
  "backup_type": "full",
  "include_history": true,
  "description": "v1.2版本发布前备份"
}
```

**输出**：
```json
{
  "backup_id": "BAK-PRJ-2026-001-001",
  "created_at": "2026-06-05T15:00:00Z",
  "size_mb": 25.6,
  "items_included": [
    "material_balance",
    "heat_balance",
    "equipment_data",
    "pfd_documents",
    "version_history"
  ],
  "retention_days": 365,
  "verdict": "数据备份创建成功"
}
```

### 数据恢复

**输入**：
```json
{
  "operation": "restore_data",
  "project_id": "PRJ-2026-001",
  "backup_id": "BAK-PRJ-2026-001-001",
  "restore_point": "v1.1",
  "items_to_restore": ["material_balance", "heat_balance"]
}
```

**输出**：
```json
{
  "restored_items": [
    { "item": "material_balance", "status": "success", "version": "v1.1" },
    { "item": "heat_balance", "status": "success", "version": "v1.1" }
  ],
  "skipped_items": [],
  "failed_items": [],
  "verdict": "数据恢复成功，2个项目已恢复到v1.1版本"
}
```

### 备份验证

**输入**：
```json
{
  "operation": "verify_backup",
  "backup_id": "BAK-PRJ-2026-001-001",
  "checksum_verification": true,
  "integrity_check": true
}
```

**输出**：
```json
{
  "checksum_match": true,
  "integrity_status": "pass",
  "data_corruption": false,
  "recovery_test": "pass",
  "verdict": "备份验证通过，数据完整无损"
}
```

## 数据质量评估

### 数据完整性评估

**输入**：
```json
{
  "assessment_type": "data_completeness",
  "project_id": "PRJ-2026-001",
  "required_fields": [
    "reactor_temperature",
    "reactor_pressure",
    "feed_composition",
    "product_specification",
    "equipment_dimensions"
  ]
}
```

**输出**：
```json
{
  "completeness_score": 85,
  "missing_fields": ["equipment_dimensions"],
  "partial_fields": ["feed_composition"],
  "recommendations": [
    "补充设备尺寸数据",
    "完善进料组成数据（缺少3个组分）"
  ],
  "verdict": "数据完整性评分85分，需补充2项数据"
}
```

### 数据准确性评估

**输入**：
```json
{
  "assessment_type": "data_accuracy",
  "project_id": "PRJ-2026-001",
  "validation_rules": [
    { "field": "reactor_temperature", "min": 150, "max": 300, "unit": "°C" },
    { "field": "reactor_pressure", "min": 1, "max": 10, "unit": "MPaG" },
    { "field": "conversion", "min": 0, "max": 100, "unit": "%" }
  ]
}
```

**输出**：
```json
{
  "accuracy_score": 92,
  "violations": [
    { "field": "reactor_temperature", "value": 350, "rule": "max 300°C", "severity": "high" }
  ],
  "warnings": [
    { "field": "conversion", "value": 99.5, "rule": "unusually high", "severity": "low" }
  ],
  "verdict": "数据准确性评分92分，发现1处违规"
}
```

## 数据迁移

### 数据格式转换

**输入**：
```json
{
  "operation": "format_conversion",
  "source_format": "pilotdeck_json",
  "target_format": "aspen_plus_xml",
  "project_id": "PRJ-2026-001",
  "data_items": ["material_balance", "heat_balance"]
}
```

**输出**：
```json
{
  "conversion_status": "success",
  "converted_items": 2,
  "output_files": [
    "PRJ-2026-001_material_balance.xml",
    "PRJ-2026-001_heat_balance.xml"
  ],
  "conversion_notes": "单位已自动转换，精度保持一致",
  "verdict": "数据格式转换成功"
}
```

### 数据导入导出

**输入**：
```json
{
  "operation": "data_export",
  "project_id": "PRJ-2026-001",
  "export_format": "excel",
  "data_items": ["equipment_list", "pipe_list", "instrument_index"],
  "include_formulas": true
}
```

**输出**：
```json
{
  "export_status": "success",
  "output_file": "PRJ-2026-001_export_20260605.xlsx",
  "sheets": [
    { "name": "设备一览表", "rows": 25 },
    { "name": "管道表", "rows": 150 },
    { "name": "仪表索引", "rows": 80 }
  ],
  "file_size_mb": 2.3,
  "verdict": "数据导出成功"
}
```