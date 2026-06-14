# SYS-L1 系统健康检查 — Runbook

> 由 `vdi-system-health` SKILL.md 引用。

---

## 检查项详表

### 1. 知识库检查 (Knowledge Base)

```yaml
- id: KB-001
  name: "条款数据完整性"
  check: "knowledge-clauses-v2.json 是否存在且可解析"
  severity: critical

- id: KB-002
  name: "规范索引有效性"
  check: "entity-index.json 是否与条款数据一致"
  severity: high

- id: KB-003
  name: "跨引用关系完整性"
  check: "cross-refs.json 中的引用目标是否存在"
  severity: medium
```

### 2. 公式库检查 (Formula Library)

```yaml
- id: FL-001
  name: "公式数据完整性"
  check: "所有公式 JSON 文件可解析且符合 schema"
  severity: critical

- id: FL-002
  name: "AST 语法树有效性"
  check: "每个公式的 equation_ast 可正确求值"
  severity: critical

- id: FL-003
  name: "参数表关联正确性"
  check: "look_up 引用的参数表存在且结构正确"
  severity: high

- id: FL-004
  name: "索引文件一致性"
  check: "index.json 与实际公式文件数量一致"
  severity: high

- id: FL-005
  name: "关键词索引有效性"
  check: "formula-keyword-index.json 中的公式 ID 存在"
  severity: medium

- id: FL-006
  name: "公式参数表引用完整性"
  check: "look_up 引用的 table_ref 在 tables.json 中存在"
  severity: high

- id: FL-007
  name: "公式 related_formulas 引用完整性"
  check: "related_formulas 中引用的 formula_id 存在"
  severity: medium

- id: FL-008
  name: "公式索引与实际文件一致性"
  check: "index.json 中每个公式的 file 字段指向的文件实际存在"
  severity: critical

- id: FL-009
  name: "参数索引公式 ID 有效性"
  check: "formula-param-index.json 中引用的公式 ID 存在"
  severity: high

- id: FL-010
  name: "关键词索引公式 ID 有效性"
  check: "formula-keyword-index.json 中引用的公式 ID 存在"
  severity: high
```

### 3. Skill 配置检查

```yaml
- id: SC-001
  name: "SKILL.md 文件格式"
  check: "所有 SKILL.md 包含必要 frontmatter"
  severity: critical

- id: SC-002
  name: "触发词配置"
  check: "triggers 字段非空且格式正确"
  severity: medium

- id: SC-003
  name: "MCP 依赖声明有效性"
  check: "mcp_required 中声明的 MCP 在 pilotdeck-vdi/mcp/ 存在"
  severity: high

- id: SC-004
  name: "层级关系定义"
  check: "level 字段值有效 (1/2/3)"
  severity: medium

- id: SC-005
  name: "Skill may_call 引用有效性"
  check: "may_call 中引用的技能名称与 Skill 目录名对应"
  severity: high

- id: SC-007
  name: "Skill 层级关系一致性"
  check: "三级体系 reports_to、called_by 关系正确"
  severity: high

- id: SC-008
  name: "Skill 跨工作空间一致性"
  check: "workspaces/ 下 SKILL.md 与 skills/ 版本一致"
  severity: medium
```

### 4. MCP 服务检查

```yaml
- id: MC-001
  name: "服务可用性"
  check: "MCP 服务目录存在且包含服务器文件"
  severity: critical

- id: MC-002
  name: "工具注册状态"
  check: "声明的工具已正确注册"
  severity: high

- id: MC-003
  name: "数据加载状态"
  check: "知识库和公式库数据可访问"
  severity: critical

- id: MC-004
  name: "MCP 工具定义完整性"
  check: "每个 MCP 服务的工具定义文件存在且格式正确"
  severity: high
```

---

## 检查流程

### 步骤 1：初始化
收集工作区路径、模块目录结构、配置文件列表。

### 步骤 2：执行检查项
按模式筛选检查项 → 逐项执行 → 记录 status / message / details。

### 步骤 3：生成报告
汇总 pass/fail/warning → 计算 health_score → 输出 recommendations。

---

## 使用示例

### 快速健康检查
```
用户：系统检查
AI：执行快速健康检查...
    ✓ 知识库文件存在 (44 条条款)
    ✓ 公式库文件存在 (32 条公式)
    ✓ 10 个 Skill 文件格式正确
    ✓ 2 个 MCP 服务可用
    健康分数: 100/100
```

### 完整系统诊断
```
用户：完整系统诊断
AI：执行完整系统诊断...
    [知识库] ✓ KB-001 ~ KB-003
    [公式库] ✓ FL-001 ~ FL-010
    [Skill]  ✓ SC-001~003,005,007  ⚠ SC-004 (2 个 Skill 缺少层级)
    [MCP]    ✓ MC-001 ~ MC-004
    健康分数: 91.7/100 · 建议处理 warning 级别问题
```

---

## 技术实现

### 检查脚本
```
pilotdeck-vdi/tests/
├── test-formula-tools.mjs    # 公式工具测试
├── test-system-health.mjs  # 系统健康检查（24 项）
└── health-report-*.json    # 自动生成报告
```

### 数据源
- 知识库：`pilotdeck-vdi/data/knowledge-clauses-v2.json`
- 公式库：`pilotdeck-vdi/data/formulas/`
- 索引：`pilotdeck-vdi/data/formulas-indices/`
- Skill：`skills/*/SKILL.md`
- MCP：`pilotdeck-vdi/mcp/`
- 工作空间副本：`workspaces/`

### 检查频率建议
- **日常**：quick（会话开始）
- **周度**：full（系统维护）
- **按需**：targeted（问题排查）

---

## 与其他 Skill 的关系

- **上级**：平台管理 / 人类运维
- **可调**：`vdi-knowledge` MCP（数据查询验证）
- **输出**：健康检查报告，供人类或系统决策
