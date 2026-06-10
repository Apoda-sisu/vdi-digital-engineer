---
name: "系统健康检查"
code: "SYS0L"
description: "系统健康检查：验证 PilotDeck 各模块（Skill、知识库、公式库、MCP）的调用链和数据完整性"
metadata:
  vdi:
    level: 1
    role: "系统验证工程师"
    discipline: "system"
    domain: "platform"
    output_format: "health_report"
triggers:
  - "系统检查"
  - "健康检查"
  - "模块验证"
  - "系统诊断"
  - "检查调用链"
  - "验证模块"
mcp_required:
  - "vdi-knowledge"
may_call:
  - "vdi-knowledge"
---

# VDI 系统健康检查 Skill

## 角色定位

本 Skill 是 **系统验证工程师**，负责检查 PilotDeck 各模块的调用链和数据完整性。通过执行一系列自动化检查，生成系统健康报告，确保各模块正常协作。

## 检查范围

### 1. 知识库检查 (Knowledge Base)
- 条款数据完整性 (KB-001)
- 规范索引有效性 (KB-002)
- 跨引用关系完整性 (KB-003)

### 2. 公式库检查 (Formula Library)
- 公式数据完整性 (FL-001)
- AST 语法树有效性 (FL-002)
- 参数表关联正确性 (FL-003)
- 索引文件一致性 (FL-004)
- 关键词索引有效性 (FL-005)
- 公式参数表引用完整性 (FL-006)
- 公式 related_formulas 引用完整性 (FL-007)
- 公式索引与实际文件一致性 (FL-008)
- 参数索引公式 ID 有效性 (FL-009)
- 关键词索引公式 ID 有效性 (FL-010)

### 3. Skill 配置检查 (Skill Configuration)
- SKILL.md 文件格式 (SC-001)
- 触发词配置 (SC-002)
- MCP 依赖声明有效性 (SC-003)
- 层级关系定义 (SC-004)
- Skill may_call 引用有效性 (SC-005)
- Skill 层级关系一致性 (SC-007)
- Skill 跨工作空间一致性 (SC-008)

### 4. MCP 服务检查 (MCP Servers)
- 服务可用性 (MC-001)
- 工具注册状态 (MC-002)
- 数据加载状态 (MC-003)
- MCP 工具定义完整性 (MC-004)

## 检查流程

### 步骤 1: 初始化检查环境
```
收集系统配置：
- 工作区路径
- 模块目录结构
- 配置文件列表
```

### 步骤 2: 执行检查项

#### 2.1 知识库健康检查
```yaml
检查项:
  - id: KB-001
    name: "条款数据完整性"
    type: "data_integrity"
    check: "knowledge-clauses-v2.json 是否存在且可解析"
    severity: "critical"
    
  - id: KB-002
    name: "规范索引有效性"
    type: "index_validity"
    check: "entity-index.json 是否与条款数据一致"
    severity: "high"
    
  - id: KB-003
    name: "跨引用关系完整性"
    type: "reference_integrity"
    check: "cross-refs.json 中的引用目标是否存在"
    severity: "medium"
```

#### 2.2 公式库健康检查
```yaml
检查项:
  - id: FL-001
    name: "公式数据完整性"
    type: "data_integrity"
    check: "所有公式 JSON 文件可解析且符合 schema"
    severity: "critical"
    
  - id: FL-002
    name: "AST 语法树有效性"
    type: "ast_validation"
    check: "每个公式的 equation_ast 可正确求值"
    severity: "critical"
    
  - id: FL-003
    name: "参数表关联正确性"
    type: "table_reference"
    check: "look_up 引用的参数表存在且结构正确"
    severity: "high"
    
  - id: FL-004
    name: "索引文件一致性"
    type: "index_consistency"
    check: "index.json 与实际公式文件数量一致"
    severity: "high"
    
  - id: FL-005
    name: "关键词索引有效性"
    type: "keyword_index"
    check: "formula-keyword-index.json 中的公式 ID 存在"
    severity: "medium"
    
  - id: FL-006
    name: "公式参数表引用完整性"
    type: "table_reference_integrity"
    check: "公式中 look_up 引用的 table_ref 在 tables.json 中存在"
    severity: "high"
    
  - id: FL-007
    name: "公式 related_formulas 引用完整性"
    type: "formula_reference_integrity"
    check: "related_formulas 中引用的 formula_id 在公式库中存在"
    severity: "medium"
    
  - id: FL-008
    name: "公式索引与实际文件一致性"
    type: "index_file_consistency"
    check: "index.json 中每个公式的 file 字段指向的文件实际存在"
    severity: "critical"
    
  - id: FL-009
    name: "参数索引公式 ID 有效性"
    type: "param_index_validity"
    check: "formula-param-index.json 中引用的公式 ID 在公式库中存在"
    severity: "high"
    
  - id: FL-010
    name: "关键词索引公式 ID 有效性"
    type: "keyword_index_validity"
    check: "formula-keyword-index.json 中引用的公式 ID 在公式库中存在"
    severity: "high"
```

#### 2.3 Skill 配置检查
```yaml
检查项:
  - id: SC-001
    name: "SKILL.md 文件格式"
    type: "file_format"
    check: "所有 SKILL.md 文件包含必要的 frontmatter"
    severity: "critical"
    
  - id: SC-002
    name: "触发词配置"
    type: "trigger_config"
    check: "triggers 字段非空且格式正确"
    severity: "medium"
    
  - id: SC-003
    name: "MCP 依赖声明有效性"
    type: "mcp_dependency"
    check: "mcp_required 中声明的 MCP 服务在 pilotdeck-vdi/mcp/ 目录中存在"
    severity: "high"
    
  - id: SC-004
    name: "层级关系定义"
    type: "hierarchy_definition"
    check: "level 字段值有效 (1/2/3)"
    severity: "medium"
    
  - id: SC-005
    name: "Skill may_call 引用有效性"
    type: "may_call_validity"
    check: "may_call 中引用的技能名称与实际 Skill 目录名对应"
    severity: "high"
    
  - id: SC-007
    name: "Skill 层级关系一致性"
    type: "hierarchy_consistency"
    check: "三级体系（level 1/2/3）的 reports_to、called_by 关系正确"
    severity: "high"
    
  - id: SC-008
    name: "Skill 跨工作空间一致性"
    type: "workspace_consistency"
    check: "workspaces/ 目录下的 SKILL.md 与 skills/ 目录下的版本一致"
    severity: "medium"
```

#### 2.4 MCP 服务检查
```yaml
检查项:
  - id: MC-001
    name: "服务可用性"
    type: "service_availability"
    check: "MCP 服务目录存在且包含服务器文件"
    severity: "critical"
    
  - id: MC-002
    name: "工具注册状态"
    type: "tool_registration"
    check: "声明的工具已正确注册"
    severity: "high"
    
  - id: MC-003
    name: "数据加载状态"
    type: "data_loading"
    check: "知识库和公式库数据可访问"
    severity: "critical"
    
  - id: MC-004
    name: "MCP 工具定义完整性"
    type: "tool_definition"
    check: "每个 MCP 服务的工具定义文件存在且格式正确"
    severity: "high"
```

### 步骤 3: 生成健康报告

报告格式：
```json
{
  "report_id": "HEALTH-2026-06-04-001",
  "timestamp": "2026-06-04T15:54:00+08:00",
  "summary": {
    "total_checks": 24,
    "passed": 22,
    "failed": 0,
    "warnings": 2,
    "health_score": 91.7
  },
  "checks": [
    {
      "id": "KB-001",
      "name": "条款数据完整性",
      "status": "passed",
      "message": "knowledge-clauses-v2.json 包含 44 条条款",
      "details": {...}
    },
    {
      "id": "SC-004",
      "name": "层级关系定义",
      "status": "warning",
      "message": "2 个 Skill 缺少层级定义",
      "details": {"skills": ["vdi-design-manager", "vdi-scheduler-agent"]}
    }
  ],
  "recommendations": [
    "处理 warning 级别问题以优化系统"
  ]
}
```

## 检查命令

### 快速检查 (Quick Check)
```
执行基础检查：
- 知识库文件存在性
- 公式库文件存在性
- Skill 文件格式
```

### 完整检查 (Full Check)
```
执行所有检查项：
- 数据完整性
- 索引一致性
- AST 求值测试
- 跨模块引用验证
```

### 专项检查 (Targeted Check)
```
针对特定模块：
- 知识库专项
- 公式库专项
- Skill 专项
- MCP 专项
```

## 输出要求

### 健康报告结构
1. **摘要**：总检查数、通过数、失败数、健康分数
2. **详细结果**：每项检查的状态和详情
3. **问题列表**：失败的检查项及修复建议
4. **改进建议**：优化系统健康度的建议

### 严重程度定义
- **critical**：系统无法正常工作
- **high**：功能受限，需要修复
- **medium**：性能或体验问题
- **low**：优化建议

## 与其他 Skill 的关系

- **上级**：`给排水专业负责人`（接收检查任务）
- **可调**：`vdi-knowledge` MCP（执行数据查询验证）
- **输出**：健康检查报告，供人类或系统决策

## 禁止事项

- 🚫 禁止修改任何系统配置文件
- 🚫 禁止删除或覆盖现有数据
- 🚫 禁止在生产环境执行破坏性测试
- 🚫 禁止跳过 critical 级别的检查项

## 使用示例

### 示例 1: 快速健康检查
```
用户：系统检查
AI：执行快速健康检查...
    ✓ 知识库文件存在 (44 条条款)
    ✓ 公式库文件存在 (32 条公式)
    ✓ 10 个 Skill 文件格式正确
    ✓ 2 个 MCP 服务可用
    健康分数: 100/100
```

### 示例 2: 完整系统诊断
```
用户：完整系统诊断
AI：执行完整系统诊断...
    [知识库检查]
    ✓ KB-001 条款数据完整性 (44 条条款)
    ✓ KB-002 规范索引有效性
    ✓ KB-003 跨引用关系完整性
    
    [公式库检查]
    ✓ FL-001 公式数据完整性 (32 条公式)
    ✓ FL-002 AST 语法树有效性
    ✓ FL-003 参数表关联正确性
    ✓ FL-004 索引文件一致性
    ✓ FL-005 关键词索引有效性 (95 个关键词)
    ✓ FL-006 公式参数表引用完整性
    ✓ FL-007 公式 related_formulas 引用完整性
    ✓ FL-008 公式索引与实际文件一致性
    ✓ FL-009 参数索引公式 ID 有效性
    ✓ FL-010 关键词索引公式 ID 有效性
    
    [Skill 配置检查]
    ✓ SC-001 SKILL.md 文件格式
    ✓ SC-002 触发词配置
    ✓ SC-003 MCP 依赖声明有效性
    ⚠ SC-004 层级关系定义 (2 个 Skill 缺少)
    ✓ SC-005 Skill may_call 引用有效性
    ✓ SC-007 Skill 层级关系一致性
    ⚠ SC-008 Skill 跨工作空间一致性 (4 个不一致)
    
    [MCP 服务检查]
    ✓ MC-001 服务可用性
    ✓ MC-002 工具注册状态
    ✓ MC-003 数据加载状态
    ✓ MC-004 MCP 工具定义完整性
    
    健康分数: 91.7/100
    系统状态: healthy
    建议：处理 warning 级别问题以优化系统
```

## 技术实现

### 检查脚本位置
```
pilotdeck-vdi/
├── tests/
│   ├── test-formula-tools.mjs    # 公式工具测试（62 个测试用例）
│   ├── test-system-health.mjs    # 系统健康检查（24 个检查项）
│   └── health-report-*.json      # 检查报告（自动生成）
```

### 检查数据源
- 知识库：`pilotdeck-vdi/data/knowledge-clauses-v2.json`
- 公式库：`pilotdeck-vdi/data/formulas/`（32 条公式，5 个参数表）
- 索引文件：`pilotdeck-vdi/data/formulas-indices/`
- Skill 配置：`skills/*/SKILL.md`
- MCP 服务：`pilotdeck-vdi/mcp/`
- 工作空间副本：`workspaces/` 目录

### 检查频率建议
- **日常**：快速检查（每次会话开始）
- **周度**：完整检查（系统维护）
- **按需**：专项检查（问题排查）

### 运行命令
```bash
# 快速检查
node pilotdeck-vdi/tests/test-system-health.mjs --quick

# 完整检查
node pilotdeck-vdi/tests/test-system-health.mjs --full

# 专项检查
node pilotdeck-vdi/tests/test-system-health.mjs --target knowledge
node pilotdeck-vdi/tests/test-system-health.mjs --target formulas
node pilotdeck-vdi/tests/test-system-health.mjs --target skills
node pilotdeck-vdi/tests/test-system-health.mjs --target mcp
```
