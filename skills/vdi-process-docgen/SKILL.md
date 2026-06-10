---
name: 工艺文档生成
code: PRDG
description: 工艺文档生成工程师。自动生成工艺设计说明书、计算书、设备数据表、管道表、仪表索引等文档。触发场景：设计说明书、计算书、设备数据表、管道表、仪表索引、文档模板。
metadata:
  vdi:
    discipline: PR
    sub_discipline: DG
    role: 执行层
    level: 3
    called_by:
      - 工艺专业负责人
      - 工艺路线设计基础
      - 物料热量平衡
      - PFD-PID设计
      - 工艺设备数据表
    pilotdeck_workspace: /workspace/workspaces/工艺组
    mcp_required: [vdi-knowledge]
    may_call: [文档导出]
    standalone: false
    triggers: [设计说明书, 计算书, 设备数据表, 管道表, 仪表索引, 文档模板]
---

# 工艺文档生成工程师（三级）

纯文档生成引擎。被二级 Skill 调用提供各类工艺设计文档自动生成服务。不输出 DisciplineOutput。

## 工艺设计说明书生成

### 基础设计说明书

**输入**：
```json
{
  "doc_type": "basic_design_description",
  "project_id": "PRJ-2026-001",
  "project_name": "甲醇合成装置",
  "design_phase": "基础设计",
  "content_sections": [
    "项目概况",
    "设计依据",
    "工艺路线选择",
    "主要操作参数",
    "设备选型原则",
    "自动化控制方案",
    "安全环保措施"
  ]
}
```

**输出**：
```json
{
  "document_id": "DOC-PRJ-2026-001-BDD-001",
  "title": "甲醇合成装置基础设计说明书",
  "format": "markdown",
  "sections": [
    { "section": "1. 项目概况", "word_count": 850, "status": "generated" },
    { "section": "2. 设计依据", "word_count": 420, "status": "generated" },
    { "section": "3. 工艺路线选择", "word_count": 1200, "status": "generated" },
    { "section": "4. 主要操作参数", "word_count": 680, "status": "generated" },
    { "section": "5. 设备选型原则", "word_count": 560, "status": "generated" },
    { "section": "6. 自动化控制方案", "word_count": 780, "status": "generated" },
    { "section": "7. 安全环保措施", "word_count": 650, "status": "generated" }
  ],
  "total_word_count": 5140,
  "file_path": "/deliverables/PRJ-2026-001/基础设计说明书.md",
  "verdict": "设计说明书生成成功"
}
```

### 详细设计说明书

**输入**：
```json
{
  "doc_type": "detailed_design_description",
  "project_id": "PRJ-2026-001",
  "project_name": "甲醇合成装置",
  "design_phase": "详细设计",
  "includeCalculations": true,
  "includeDrawings": true,
  "includeTables": true
}
```

**输出**：
```json
{
  "document_id": "DOC-PRJ-2026-001-DDD-001",
  "title": "甲醇合成装置详细设计说明书",
  "format": "markdown",
  "sections": [
    { "section": "1. 设计总述", "word_count": 1200, "status": "generated" },
    { "section": "2. 工艺计算", "word_count": 3500, "status": "generated" },
    { "section": "3. 设备设计", "word_count": 2800, "status": "generated" },
    { "section": "4. 管道设计", "word_count": 1800, "status": "generated" },
    { "section": "5. 仪表设计", "word_count": 1500, "status": "generated" },
    { "section": "6. 电气设计", "word_count": 1200, "status": "generated" },
    { "section": "7. 安全设计", "word_count": 1600, "status": "generated" },
    { "section": "8. 环保设计", "word_count": 900, "status": "generated" }
  ],
  "total_word_count": 14500,
  "file_path": "/deliverables/PRJ-2026-001/详细设计说明书.md",
  "verdict": "详细设计说明书生成成功"
}
```

## 工艺计算书生成

### 物料平衡计算书

**输入**：
```json
{
  "doc_type": "material_balance_calculation",
  "project_id": "PRJ-2026-001",
  "calculation_data": {
    "feed_streams": [
      { "id": "F-001", "flow_kgmolh": 100, "composition": { "CH4": 0.9, "H2O": 0.1 } }
    ],
    "product_streams": [
      { "id": "P-001", "flow_kgmolh": 80, "composition": { "CH3OH": 0.95, "H2O": 0.05 } }
    ],
    "recycle_streams": [
      { "id": "R-001", "flow_kgmolh": 50, "composition": { "H2": 0.7, "CO": 0.3 } }
    ]
  },
  "includeVerification": true
}
```

**输出**：
```json
{
  "document_id": "DOC-PRJ-2026-001-MBC-001",
  "title": "甲醇合成装置物料平衡计算书",
  "format": "markdown",
  "sections": [
    { "section": "1. 计算目的", "word_count": 200, "status": "generated" },
    { "section": "2. 计算依据", "word_count": 350, "status": "generated" },
    { "section": "3. 计算过程", "word_count": 1200, "status": "generated" },
    { "section": "4. 计算结果", "word_count": 800, "status": "generated" },
    { "section": "5. 结果验证", "word_count": 450, "status": "generated" }
  ],
  "total_word_count": 3000,
  "file_path": "/deliverables/PRJ-2026-001/物料平衡计算书.md",
  "verdict": "物料平衡计算书生成成功"
}
```

### 热量平衡计算书

**输入**：
```json
{
  "doc_type": "heat_balance_calculation",
  "project_id": "PRJ-2026-001",
  "calculation_data": {
    "unit_operations": [
      {
        "name": "reactor",
        "heat_duties": {
          "reaction_heat_kw": 5000,
          "heat_loss_kw": 200
        }
      },
      {
        "name": "distillation_column",
        "heat_duties": {
          "reboiler_duty_kw": 850,
          "condenser_duty_kw": 800
        }
      }
    ],
    "utility_streams": [
      { "type": "cooling_water", "duty_kw": 6000 },
      { "type": "steam", "duty_kw": 850 }
    ]
  },
  "includeVerification": true
}
```

**输出**：
```json
{
  "document_id": "DOC-PRJ-2026-001-HBC-001",
  "title": "甲醇合成装置热量平衡计算书",
  "format": "markdown",
  "sections": [
    { "section": "1. 计算目的", "word_count": 200, "status": "generated" },
    { "section": "2. 计算依据", "word_count": 300, "status": "generated" },
    { "section": "3. 计算过程", "word_count": 1500, "status": "generated" },
    { "section": "4. 计算结果", "word_count": 900, "status": "generated" },
    { "section": "5. 结果验证", "word_count": 400, "status": "generated" }
  ],
  "total_word_count": 3300,
  "file_path": "/deliverables/PRJ-2026-001/热量平衡计算书.md",
  "verdict": "热量平衡计算书生成成功"
}
```

## 设备数据表生成

### 反应器数据表

**输入**：
```json
{
  "doc_type": "equipment_data_sheet",
  "equipment_type": "reactor",
  "project_id": "PRJ-2026-001",
  "equipment_data": {
    "tag": "R-101",
    "name": "甲醇合成反应器",
    "type": "fixed_bed",
    "design_pressure_MPaG": 6.0,
    "design_temperature_C": 280,
    "operating_pressure_MPaG": 5.0,
    "operating_temperature_C": 225,
    "volume_m3": 25,
    "catalyst": "Cu/ZnO/Al2O3",
    "catalyst_weight_kg": 15000
  }
}
```

**输出**：
```json
{
  "document_id": "DOC-PRJ-2026-001-EDS-001",
  "title": "R-101 甲醇合成反应器数据表",
  "format": "markdown",
  "sections": [
    { "section": "1. 设备基本信息", "word_count": 300, "status": "generated" },
    { "section": "2. 设计参数", "word_count": 450, "status": "generated" },
    { "section": "3. 操作参数", "word_count": 350, "status": "generated" },
    { "section": "4. 结构参数", "word_count": 400, "status": "generated" },
    { "section": "5. 材料选择", "word_count": 250, "status": "generated" },
    { "section": "6. 制造要求", "word_count": 300, "status": "generated" }
  ],
  "total_word_count": 2050,
  "file_path": "/deliverables/PRJ-2026-001/设备数据表/R-101_甲醇合成反应器数据表.md",
  "verdict": "反应器数据表生成成功"
}
```

### 精馏塔数据表

**输入**：
```json
{
  "doc_type": "equipment_data_sheet",
  "equipment_type": "distillation_column",
  "project_id": "PRJ-2026-001",
  "equipment_data": {
    "tag": "T-201",
    "name": "甲醇精馏塔",
    "type": "sieve_tray",
    "design_pressure_MPaG": 0.3,
    "design_temperature_C": 150,
    "number_of_trays": 35,
    "tray_spacing_mm": 600,
    "diameter_mm": 1200,
    "height_mm": 25000
  }
}
```

**输出**：
```json
{
  "document_id": "DOC-PRJ-2026-001-EDS-002",
  "title": "T-201 甲醇精馏塔数据表",
  "format": "markdown",
  "sections": [
    { "section": "1. 设备基本信息", "word_count": 300, "status": "generated" },
    { "section": "2. 设计参数", "word_count": 400, "status": "generated" },
    { "section": "3. 操作参数", "word_count": 350, "status": "generated" },
    { "section": "4. 结构参数", "word_count": 450, "status": "generated" },
    { "section": "5. 塔板设计", "word_count": 350, "status": "generated" },
    { "section": "6. 材料选择", "word_count": 250, "status": "generated" }
  ],
  "total_word_count": 2100,
  "file_path": "/deliverables/PRJ-2026-001/设备数据表/T-201_甲醇精馏塔数据表.md",
  "verdict": "精馏塔数据表生成成功"
}
```

## 管道表生成

### 工艺管道表

**输入**：
```json
{
  "doc_type": "pipe_list",
  "project_id": "PRJ-2026-001",
  "pipe_data": [
    {
      "pipe_id": "PP-001",
      "fluid": "合成气",
      "flow_kgmolh": 150,
      "design_pressure_MPaG": 6.0,
      "design_temperature_C": 250,
      "pipe_material": "A106-B",
      "insulation": "yes"
    },
    {
      "pipe_id": "PP-002",
      "fluid": "甲醇产品",
      "flow_kgmolh": 80,
      "design_pressure_MPaG": 0.5,
      "design_temperature_C": 40,
      "pipe_material": "304SS",
      "insulation": "no"
    }
  ]
}
```

**输出**：
```json
{
  "document_id": "DOC-PRJ-2026-001-PL-001",
  "title": "甲醇合成装置工艺管道表",
  "format": "markdown",
  "sections": [
    { "section": "1. 管道表说明", "word_count": 200, "status": "generated" },
    { "section": "2. 管道清单", "word_count": 800, "status": "generated" },
    { "section": "3. 管道规格", "word_count": 600, "status": "generated" },
    { "section": "4. 材料清单", "word_count": 400, "status": "generated" }
  ],
  "total_word_count": 2000,
  "file_path": "/deliverables/PRJ-2026-001/管道表.md",
  "verdict": "工艺管道表生成成功"
}
```

## 仪表索引生成

### 控制仪表索引

**输入**：
```json
{
  "doc_type": "instrument_index",
  "project_id": "PRJ-2026-001",
  "instrument_data": [
    {
      "tag": "TIC-101",
      "type": "temperature_indicator_controller",
      "measurement_point": "reactor_outlet",
      "range": "0-300°C",
      "setpoint": 225,
      "control_action": "adjust_cooling_water"
    },
    {
      "tag": "PIC-102",
      "type": "pressure_indicator_controller",
      "measurement_point": "reactor_inlet",
      "range": "0-10 MPaG",
      "setpoint": 5.0,
      "control_action": "adjust_compressor_speed"
    }
  ]
}
```

**输出**：
```json
{
  "document_id": "DOC-PRJ-2026-001-II-001",
  "title": "甲醇合成装置控制仪表索引",
  "format": "markdown",
  "sections": [
    { "section": "1. 仪表索引说明", "word_count": 250, "status": "generated" },
    { "section": "2. 温度仪表", "word_count": 500, "status": "generated" },
    { "section": "3. 压力仪表", "word_count": 450, "status": "generated" },
    { "section": "4. 流量仪表", "word_count": 400, "status": "generated" },
    { "section": "5. 液位仪表", "word_count": 350, "status": "generated" }
  ],
  "total_word_count": 1950,
  "file_path": "/deliverables/PRJ-2026-001/仪表索引.md",
  "verdict": "控制仪表索引生成成功"
}
```

## 安全分析文档生成

### HAZOP分析报告

**输入**：
```json
{
  "doc_type": "hazop_report",
  "project_id": "PRJ-2026-001",
  "node": "reactor_system",
  "deviations": [
    {
      "guide_word": "more",
      "parameter": "temperature",
      "cause": "cooling_water_failure",
      "consequence": "catalyst_deactivation",
      "safeguard": "high_temperature_alarm",
      "recommendation": "add_emergency_shut_down"
    }
  ]
}
```

**输出**：
```json
{
  "document_id": "DOC-PRJ-2026-001-HAZ-001",
  "title": "甲醇合成装置HAZOP分析报告",
  "format": "markdown",
  "sections": [
    { "section": "1. 分析概述", "word_count": 400, "status": "generated" },
    { "section": "2. 节点划分", "word_count": 300, "status": "generated" },
    { "section": "3. 偏差分析", "word_count": 800, "status": "generated" },
    { "section": "4. 安全措施", "word_count": 500, "status": "generated" },
    { "section": "5. 建议措施", "word_count": 400, "status": "generated" }
  ],
  "total_word_count": 2400,
  "file_path": "/deliverables/PRJ-2026-001/HAZOP分析报告.md",
  "verdict": "HAZOP分析报告生成成功"
}
```

## 文档模板管理

### 获取文档模板

**输入**：
```json
{
  "operation": "get_template",
  "template_type": "equipment_data_sheet",
  "equipment_type": "heat_exchanger",
  "format": "markdown"
}
```

**输出**：
```json
{
  "template_id": "TPL-EDS-HE-001",
  "template_name": "换热器数据表模板",
  "format": "markdown",
  "sections": [
    "1. 设备基本信息",
    "2. 设计参数",
    "3. 操作参数",
    "4. 热力设计",
    "5. 机械设计",
    "6. 材料清单"
  ],
  "variables": ["tag", "name", "type", "duty_kw", "area_m2"],
  "verdict": "模板获取成功"
}
```

### 创建自定义模板

**输入**：
```json
{
  "operation": "create_template",
  "template_name": "自定义反应器数据表",
  "base_template": "TPL-EDS-RE-001",
  "custom_sections": [
    "1. 设备基本信息",
    "2. 催化剂信息",
    "3. 设计参数",
    "4. 操作参数",
    "5. 结构参数",
    "6. 材料选择",
    "7. 制造要求",
    "8. 特殊要求"
  ],
  "custom_variables": ["catalyst_type", "catalyst_weight_kg", "bed_volume_m3"]
}
```

**输出**：
```json
{
  "template_id": "TPL-CUSTOM-RE-001",
  "template_name": "自定义反应器数据表",
  "base_template": "TPL-EDS-RE-001",
  "sections_count": 8,
  "variables_count": 10,
  "verdict": "自定义模板创建成功"
}
```

## 文档质量检查

### 文档完整性检查

**输入**：
```json
{
  "check_type": "document_completeness",
  "document_id": "DOC-PRJ-2026-001-BDD-001",
  "required_sections": [
    "项目概况",
    "设计依据",
    "工艺路线选择",
    "主要操作参数",
    "设备选型原则"
  ]
}
```

**输出**：
```json
{
  "completeness_score": 100,
  "missing_sections": [],
  "extra_sections": ["自动化控制方案", "安全环保措施"],
  "status": "complete",
  "verdict": "文档完整性检查通过"
}
```

### 文档格式检查

**输入**：
```json
{
  "check_type": "document_format",
  "document_id": "DOC-PRJ-2026-001-BDD-001",
  "format_rules": {
    "heading_levels": 3,
    "table_format": "markdown",
    "figure_format": "png",
    "reference_format": "numbered"
  }
}
```

**输出**：
```json
{
  "format_compliance": 95,
  "issues": [
    { "type": "heading_level", "location": "section 3.2", "issue": "使用了4级标题" },
    { "type": "table_format", "location": "table 2", "issue": "表格格式不一致" }
  ],
  "recommendations": [
    "统一标题层级为3级",
    "统一表格格式"
  ],
  "verdict": "文档格式检查完成，合规率95%"
}
```