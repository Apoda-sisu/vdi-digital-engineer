# PilotDeck 模块关联关系图

> 自动生成于 2026-06-14T03:34:04.568Z
> 节点: 307 | 边: 424

## 总览

| 模块类型 | 数量 |
|----------|------|
| Skill | 1 |
| MCP 服务 | 7 |
| MCP 工具 | 69 |
| 公式 | 167 |
| 参数表 | 27 |
| 事件类型 | 28 |
| 专业 | 8 |

## 关联关系统计

| 关联类型 | 数量 | 说明 |
|----------|------|------|
| SKILL_DISCIPLINE | 70 | Skill 专业 |
| MCP_TOOL | 69 | MCP 工具 |
| FORMULA_DISCIPLINE | 168 | 公式专业 |
| FORMULA_TABLE | 11 | 公式→参数表 |
| FORMULA_RELATED | 42 | 公式关联 |
| EVENT_PRODUCER | 20 | 事件发布 |
| EVENT_CONSUMER | 44 | 事件消费 |

## Skill → MCP 依赖详情

| Skill | MCP 依赖 |
|-------|----------|

## MCP 工具详情

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

### vdi-cad（17 个工具）

- `vdi_cad_generate`
- `vdi_cad_status`
- `vdi_cad_export`
- `vdi_cad_screenshot`
- `vdi_cad_execute`
- `vdi_cad_extract_model`
- `vdi_cad_apply_delta`
- `vdi_cad_load_plant_model`
- `vdi_cad_validate_plant_model`
- `vdi_cad_export_object_list`
- `vdi_cad_export_dexpi`
- `vdi_cad_export_cfihos`
- `vdi_cad_apply_plant_delta`
- `vdi_cad_get_object`
- `vdi_cad_get_drawing_manifest`
- `vdi_cad_resolve_pick`
- `vdi_cad_regenerate_drawing`

### vdi-events（5 个工具）

- `vdi_publish_event`
- `vdi_consume_pending`
- `vdi_ack_event`
- `vdi_get_event_status`
- `vdi_list_subscribers`

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

### vdi-rules（5 个工具）

- `vdi_check_redlines`
- `vdi_validate_discipline_output`
- `vdi_check_data_completeness`
- `vdi_check_review_gate`
- `vdi_validate_plant_model`

### vdi-vision（2 个工具）

- `vdi_analyze_image`
- `vdi_vision_status`

## Skill 组织关系

## 公式库分布

| 专业 | 公式数量 |
|------|----------|
| EA | 30 |
| HS | 2 |
| IN | 14 |
| MP | 35 |
| PX | 50 |
| CI | 37 |

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
- 发布者: PX, JA
- 消费者: MP, IN, CI, HS, EA

### `design_basis.acknowledged`
- 发布者: MP, IN, CI, HS, EA
- 消费者: PX, JA

### `discipline_output.submitted`
- 发布者: (无)
- 消费者: (无)

### `discipline_output.published`
- 发布者: (无)
- 消费者: (无)

### `condition.changed`
- 发布者: EA, CI
- 消费者: (无)

### `piping_layout.updated`
- 发布者: MP
- 消费者: IN, EA, CI

### `instrument_location.updated`
- 发布者: IN
- 消费者: MP, EA

### `electrical_layout.updated`
- 发布者: EA
- 消费者: MP, IN

### `structural_condition.updated`
- 发布者: (无)
- 消费者: MP, IN, CI

### `equipment_data.updated`
- 发布者: (无)
- 消费者: MP, IN, CI

### `water_condition.updated`
- 发布者: CI
- 消费者: EA, MP, IN

### `fire_condition.updated`
- 发布者: (无)
- 消费者: CI, EA, MP

### `hvac_condition.updated`
- 发布者: (无)
- 消费者: CI, EA, MP

### `material_data.updated`
- 发布者: (无)
- 消费者: MP, IN

### `stress_analysis.completed`
- 发布者: (无)
- 消费者: MP

### `review_gate.passed`
- 发布者: (无)
- 消费者: AA

### `review_gate.failed`
- 发布者: (无)
- 消费者: AA

### `task.status_changed`
- 发布者: (无)
- 消费者: AA

### `milestone.at_risk`
- 发布者: AA
- 消费者: AA

### `milestone.achieved`
- 发布者: AA
- 消费者: AA

### `human.data_requested`
- 发布者: (无)
- 消费者: AA

### `human.data_supplied`
- 发布者: AA
- 消费者: (无)

### `human.review_requested`
- 发布者: (无)
- 消费者: AA

### `human.review_resolved`
- 发布者: AA
- 消费者: (无)

### `procurement.requested`
- 发布者: IN
- 消费者: (无)

### `procurement.acknowledged`
- 发布者: (无)
- 消费者: IN

### `model_review.scheduled`
- 发布者: MP
- 消费者: IN, EA, CI

### `model_review.completed`
- 发布者: MP
- 消费者: AA
