# PilotDeck 模块关联关系图

> 自动生成于 2026-06-08T05:28:44.182Z
> 节点: 307 | 边: 365

## 总览

| 模块类型 | 数量 |
|----------|------|
| Skill | 25 |
| MCP 服务 | 6 |
| MCP 工具 | 49 |
| 公式 | 162 |
| 参数表 | 27 |
| 事件类型 | 28 |
| 专业 | 10 |

## 关联关系统计

| 关联类型 | 数量 | 说明 |
|----------|------|------|
| SKILL_MCP | 28 | Skill → MCP |
| SKILL_DISCIPLINE | 25 | Skill 专业 |
| SKILL_REPORTS_TO | 12 | Skill 汇报 |
| SKILL_MANAGES | 12 | Skill 管理 |
| MCP_TOOL | 49 | MCP 工具 |
| FORMULA_DISCIPLINE | 162 | 公式专业 |
| FORMULA_TABLE | 11 | 公式→参数表 |
| FORMULA_RELATED | 42 | 公式关联 |
| EVENT_PRODUCER | 8 | 事件发布 |
| EVENT_CONSUMER | 16 | 事件消费 |

## Skill → MCP 依赖详情

| Skill | MCP 依赖 |
|-------|----------|
| 设计经理 | vdi-orchestrator, vdi-knowledge |
| 文档导出 | documents |
| 文档解读 | documents, vdi-knowledge |
| 工艺专业负责人 | vdi-orchestrator, vdi-knowledge, vdi-rules |
| 计划调度 | vdi-orchestrator, vdi-knowledge |
| "系统健康检查" | "vdi-knowledge" |
| 循环水系统设计 | vdi-knowledge, vdi-rules |
| 排水系统设计 | vdi-knowledge, vdi-rules |
| 给排水设备选型 | vdi-knowledge |
| 消防给水设计 | vdi-knowledge, vdi-rules |
| 给排水水力计算 | vdi-knowledge |
| 给排水专业负责人 | vdi-orchestrator, vdi-knowledge, vdi-rules |
| 雨水系统设计 | vdi-knowledge, vdi-rules |
| 给水系统设计 | vdi-knowledge, vdi-rules |
| 污水处理设计 | vdi-knowledge, vdi-rules |

## MCP 工具详情

### vdi-orchestrator（11 个工具）

- `vdi_create_task_package`
- `vdi_decompose_tasks`
- `vdi_dispatch_task`
- `vdi_check_milestone`
- `vdi_get_dependency_graph`
- `vdi_trigger_alert`
- `vdi_update_task_status`
- `vdi_request_human_review`
- `vdi_resolve_human_review`
- `vdi_check_stale_tasks`
- `vdi_attempt_recovery`

### vdi-knowledge（9 个工具）

- `vdi_search_knowledge`
- `vdi_get_citation`
- `vdi_search_by_entity`
- `vdi_resolve_cross_refs`
- `vdi_list_standards`
- `vdi_search_formulas`
- `vdi_get_formula`
- `vdi_calculate`
- `vdi_calculate_composite`

### documents（20 个工具）

- `content_read`
- `content_write`
- `content_append`
- `content_insert`
- `content_replace`
- `compose_docx`
- `compose_pdf`
- `compose_from_markdown`
- `structured_get`
- `structured_set`
- `structured_delete`
- `structured_meta`
- `search_in_format`
- `file_create`
- `file_delete`
- `file_copy`
- `file_move`
- `version_list`
- `version_diff`
- `version_restore`

### vdi-rules（4 个工具）

- `vdi_check_redlines`
- `vdi_validate_discipline_output`
- `vdi_check_data_completeness`
- `vdi_check_review_gate`

### "vdi-knowledge"（0 个工具）


### vdi-events（5 个工具）

- `vdi_publish_event`
- `vdi_consume_pending`
- `vdi_ack_event`
- `vdi_get_event_status`
- `vdi_list_subscribers`

## Skill 组织关系

### 管理链

- **工艺专业负责人** 管理 → 工艺路线设计基础
- **工艺专业负责人** 管理 → 物料热量平衡
- **工艺专业负责人** 管理 → PFD-PID设计
- **工艺专业负责人** 管理 → 工艺设备数据表
- **工艺专业负责人** 管理 → 工艺安全分析
- **工艺专业负责人** 管理 → 公用工程排放
- **给排水专业负责人** 管理 → 给水系统设计
- **给排水专业负责人** 管理 → 消防给水设计
- **给排水专业负责人** 管理 → 排水系统设计
- **给排水专业负责人** 管理 → 雨水系统设计
- **给排水专业负责人** 管理 → 污水处理设计
- **给排水专业负责人** 管理 → 循环水系统设计

### 汇报链

- 物料热量平衡 → 汇报至 **工艺专业负责人**
- 工艺设备数据表 → 汇报至 **工艺专业负责人**
- PFD-PID设计 → 汇报至 **工艺专业负责人**
- 工艺路线设计基础 → 汇报至 **工艺专业负责人**
- 工艺安全分析 → 汇报至 **工艺专业负责人**
- 公用工程排放 → 汇报至 **工艺专业负责人**
- 循环水系统设计 → 汇报至 **给排水专业负责人**
- 排水系统设计 → 汇报至 **给排水专业负责人**
- 消防给水设计 → 汇报至 **给排水专业负责人**
- 雨水系统设计 → 汇报至 **给排水专业负责人**
- 给水系统设计 → 汇报至 **给排水专业负责人**
- 污水处理设计 → 汇报至 **给排水专业负责人**

## 公式库分布

| 专业 | 公式数量 |
|------|----------|
| electrical | 30 |
| hse | 2 |
| instrument | 14 |
| piping | 35 |
| process | 44 |
| water | 37 |

## 公式 → 参数表引用

| 公式 | 参数 | 参数表 |
|------|------|--------|
| PI-STR-002 | α | [object Object] |
| WA-EQ-003 | Hv | [object Object] |
| WA-FIR-003 | q | [object Object] |
| WA-FIR-003 | A | [object Object] |
| WA-HYD-001 | C | [object Object] |
| WA-HYD-002 | n | [object Object] |
| WA-HYD-008 | ν | [object Object] |
| WA-HYD-013 | ε | [object Object] |
| WA-HYD-019 | n | [object Object] |
| WA-RAI-001 | ψ | [object Object] |
| WA-RAI-003 | K | [object Object] |

## 公式间关联

| 公式 | 关联公式 |
|------|----------|
| WA-EQ-001 | undefined |
| WA-EQ-002 | undefined |
| WA-EQ-003 | undefined |
| WA-EQ-004 | undefined |
| WA-EQ-006 | undefined |
| WA-FIR-003 | undefined |
| WA-FIR-004 | undefined |
| WA-FIR-004 | undefined |
| WA-HYD-001 | undefined |
| WA-HYD-001 | undefined |
| WA-HYD-002 | undefined |
| WA-HYD-005 | undefined |
| WA-HYD-006 | undefined |
| WA-HYD-007 | undefined |
| WA-HYD-007 | undefined |
| WA-HYD-008 | undefined |
| WA-HYD-009 | undefined |
| WA-HYD-009 | undefined |
| WA-HYD-009 | undefined |
| WA-HYD-010 | undefined |
| WA-HYD-010 | undefined |
| WA-HYD-010 | undefined |
| WA-HYD-011 | undefined |
| WA-HYD-011 | undefined |
| WA-HYD-012 | undefined |
| WA-HYD-012 | undefined |
| WA-HYD-012 | undefined |
| WA-HYD-013 | undefined |
| WA-HYD-013 | undefined |
| WA-HYD-014 | undefined |
| WA-HYD-014 | undefined |
| WA-HYD-015 | undefined |
| WA-HYD-015 | undefined |
| WA-HYD-015 | undefined |
| WA-HYD-016 | undefined |
| WA-HYD-016 | undefined |
| WA-HYD-017 | undefined |
| WA-HYD-017 | undefined |
| WA-HYD-018 | undefined |
| WA-HYD-019 | undefined |
| WA-HYD-019 | undefined |
| WA-RAI-001 | undefined |

## 事件驱动关系

### `design_basis.updated`
- 发布者: PR
- 消费者: WA

### `design_basis.acknowledged`
- 发布者: WA
- 消费者: PR

### `discipline_output.submitted`
- 发布者: (无)
- 消费者: (无)

### `discipline_output.published`
- 发布者: (无)
- 消费者: (无)

### `condition.changed`
- 发布者: WA
- 消费者: (无)

### `piping_layout.updated`
- 发布者: (无)
- 消费者: WA

### `instrument_location.updated`
- 发布者: (无)
- 消费者: (无)

### `electrical_layout.updated`
- 发布者: (无)
- 消费者: (无)

### `structural_condition.updated`
- 发布者: (无)
- 消费者: WA

### `equipment_data.updated`
- 发布者: (无)
- 消费者: WA

### `water_condition.updated`
- 发布者: WA
- 消费者: (无)

### `fire_condition.updated`
- 发布者: (无)
- 消费者: WA

### `hvac_condition.updated`
- 发布者: (无)
- 消费者: WA

### `material_data.updated`
- 发布者: (无)
- 消费者: (无)

### `stress_analysis.completed`
- 发布者: (无)
- 消费者: (无)

### `review_gate.passed`
- 发布者: (无)
- 消费者: MG

### `review_gate.failed`
- 发布者: (无)
- 消费者: MG

### `task.status_changed`
- 发布者: (无)
- 消费者: MG

### `milestone.at_risk`
- 发布者: MG
- 消费者: MG

### `milestone.achieved`
- 发布者: MG
- 消费者: MG

### `human.data_requested`
- 发布者: (无)
- 消费者: MG

### `human.data_supplied`
- 发布者: MG
- 消费者: (无)

### `human.review_requested`
- 发布者: (无)
- 消费者: MG

### `human.review_resolved`
- 发布者: MG
- 消费者: (无)

### `procurement.requested`
- 发布者: (无)
- 消费者: (无)

### `procurement.acknowledged`
- 发布者: (无)
- 消费者: (无)

### `model_review.scheduled`
- 发布者: (无)
- 消费者: WA

### `model_review.completed`
- 发布者: (无)
- 消费者: MG
