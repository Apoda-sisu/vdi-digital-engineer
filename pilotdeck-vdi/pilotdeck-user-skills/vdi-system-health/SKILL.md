---
name: "系统健康检查"
code: "CFIHOS-20000016"
description: "系统健康检查：验证 PilotDeck 各模块（Skill、知识库、公式库、MCP）的调用链和数据完整性"
metadata:
  vdi:
    level: 1
    cfihos_unique_code: CFIHOS-20000016
    cfihos_document_type: JA
    role: "系统验证工程师"
    discipline: JA
    vdi_discipline: system
    domain: "platform"
    generation: v1.2
    output_format: "health_report"
    mcp_required:
      - "vdi-knowledge"
    may_call:
      - "vdi-knowledge"
    triggers:
      - "系统检查"
      - "健康检查"
      - "模块验证"
      - "系统诊断"
      - "检查调用链"
      - "验证模块"
---

# VDI 系统健康检查 Skill（一级 · SYS-L1 · V1.2）

## 角色定位

**系统验证工程师**——检查 PilotDeck 各模块调用链与数据完整性，生成健康报告。**只读检查，不修改配置或数据。**

## 检查范围（摘要）

| 模块 | 检查项 ID | 数量 |
|------|-----------|------|
| 知识库 | KB-001 ~ KB-003 | 3 |
| 公式库 | FL-001 ~ FL-010 | 10 |
| Skill 配置 | SC-001 ~ SC-008 | 7 |
| MCP 服务 | MC-001 ~ MC-004 | 4 |

**详则**：检查项定义、YAML 规格、示例输出见 [`references/health-runbook.md`](references/health-runbook.md)

## CP 协议

| CP | 步骤 | 停止 |
|----|------|------|
| **0** | 确认检查模式（quick / full / targeted）与目标模块 | ⛔ 等待 |
| **1** | 执行检查项；收集 pass/fail/warning | — |
| **2** | 生成健康报告 JSON + 人类可读摘要 | ⛔ 等待 |
| **3** | 输出修复建议（仅建议，不自动修复） | ⛔ 等待 |

## 检查模式

| 模式 | 范围 |
|------|------|
| quick | 文件存在性 + Skill 格式 |
| full | 全部 24 项（数据完整性、索引一致性、AST 求值） |
| targeted | 单模块：knowledge / formulas / skills / mcp |

## 输出契约（health_report）

```json
{
  "report_id": "HEALTH-2026-06-04-001",
  "summary": {
    "total_checks": 24,
    "passed": 22,
    "failed": 0,
    "warnings": 2,
    "health_score": 91.7
  },
  "checks": [
    { "id": "KB-001", "name": "条款数据完整性", "status": "passed" }
  ],
  "recommendations": ["处理 warning 级别问题以优化系统"]
}
```

## 严重程度

| 级别 | 含义 |
|------|------|
| critical | 系统无法正常工作 |
| high | 功能受限，需修复 |
| medium | 性能或体验问题 |
| low | 优化建议 |

## 禁止事项

- 🚫 禁止修改系统配置文件
- 🚫 禁止删除或覆盖现有数据
- 🚫 禁止生产环境破坏性测试
- 🚫 禁止跳过 critical 级别检查项

## 运行命令

```bash
node pilotdeck-vdi/tests/test-system-health.mjs --quick
node pilotdeck-vdi/tests/test-system-health.mjs --full
node pilotdeck-vdi/tests/test-system-health.mjs --target knowledge
```

**详则与示例**：[`references/health-runbook.md`](references/health-runbook.md)

---

**版本**：V1.2 · 2026-06-13 · SYS-M1 压缩迁移（检查详则迁 references/health-runbook.md）
