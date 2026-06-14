---
name: vdi-skill-governance
description: >-
  VDI 数字工程师 Skill 建设与质量管控。在创建/修改 workspaces/{专业组}/skills/ 下 Skill 时使用；
  结合 skill-creator 流程与本仓库 audit/e2e 脚本做门禁。触发：新建专业 Skill、
  Skill 深化、Skill 审计、质量验收、1010 方案落地。
---

# VDI Skill 建设与质量管控

## 前置 Skill

**先加载 `skill-creator`**（`.cursor/skills/skill-creator/` 或 `~/.cursor/skills/skill-creator/`）完成起草、eval、description 优化。

本 Skill 补充 **VDI 仓库约定** 与 **自动化门禁**，不重复 skill-creator 通用流程。

## 仓库布局

**严禁**在仓库根目录创建 `skills/` 或 `vdi-*-workspace/`。路径真相源：`pilotdeck-vdi/config/skills-layout.mjs`

| 路径 | 用途 |
|------|------|
| `workspaces/{专业组}/skills/vdi-*/SKILL.md` | 正式 Skill 实体（L1/L2/L3） |
| `workspaces/{专业组}/skills/INDEX.md` | 专业索引与审计命令 |
| `workspaces/{专业组}/skill-workspaces/{slug}/` | eval 快照与迭代产物 |
| `workspaces/skills-registry.json` | 全库 Skill 索引 |
| `pilotdeck-vdi/config/discipline-codes.json` | 专业激活与 sub_skills 列表 |
| `pilotdeck-vdi/mcp/vdi-rules/vdi-rules.json` | 交付物契约 |
| `pilotdeck-vdi/data/*-knowledge-manifest.json` | 知识库配额 |

## VDI Skill 模板（质量优先，行数为软门禁）

| 层级 | 建议行数 | 原则 |
|------|----------|------|
| L1 | ~150 | 编排/WBS/事件；细则可放 `references/` |
| L2 | ~200 | CP 协议+契约+检索词保留正文；长模板放 `references/` |
| L3 | 无上限 | 过薄（<40 行）需补 calc_type/边界说明 |

1. YAML：`deliverable_code`、`reports_to: vdi-{discipline}-lead`、`mcp_required: vdi-knowledge, vdi-rules`
2. **CP-0→3** 交互模式 + `⛔ [CP-N 完成] — 等待人类响应`
3. 规范检索（CP 前必调 `vdi_search_knowledge`）
4. 输出契约 JSON 对齐 `vdi-rules.json`
5. 任务卡（PI-PLANT-BASE 等）
6. L2 上架前：`evals/evals.json`（样板 `vdi-piping-material-class`、`vdi-water-drainage`）

### CP 输出模板（全专业统一）

L2 正文 **必须** 包含：

```markdown
## CP 输出模板（渐进披露）
**输出 CP-N 前，必须先读取** `references/{deliverable-code}-cp-templates.md` 中 CP-N 模板；
模板内示例数值不得当作 MUST 输入。
```

命名：`pi-d01-cp-templates.md`、`wa-d03-cp-templates.md` 等。原则见 `0000_智慧设计蜂群 Skill建设原则.md` §2。

批量生成/深化脚本：`scripts/deepen-piping-skills-v11.mjs`、`scripts/generate-piping-skills.mjs`

## 质量门禁（每次 Skill 变更后必跑）

```bash
# 全局审计（推荐首选）
node pilotdeck-vdi/scripts/audit-all-skills.mjs
node pilotdeck-vdi/scripts/audit-all-skills.mjs --strict-eval   # L2 缺 evals 则 fail

# 专业 Skill 结构审计（已由 audit-all 委派，可单独跑）
node pilotdeck-vdi/scripts/audit-{discipline}-skills.mjs

# 知识库治理（配额、tag 覆盖率）
node pilotdeck-vdi/scripts/audit-knowledge.mjs

# 知识检索 MCP 回归（如有 manifest）
node pilotdeck-vdi/scripts/test-{discipline}-knowledge-retrieval.mjs

# 契约链 E2E（如已配置）
node pilotdeck-vdi/scripts/e2e-{discipline}-chain.mjs
```

`{discipline}` = `piping` | `water` | `process` · 规格见 `docs/系统建设方案与各模块设计/1013_audit-all-skills规格.md`

## skill-creator 集成工作流

```
1. skill-creator：访谈 → 起草 SKILL.md → evals/evals.json
2. vdi-skill-governance：对齐 VDI 模板 + 更新 INDEX + discipline-codes
3. 跑 audit-* → 修复至 0 fail
4. skill-creator：description 优化 + 迭代 eval
5. 更新 1011 Sprint 记录（如属 Sprint 交付）
```

## Eval 建议（VDI L2 Skill）

| 断言类型 | 示例 |
|----------|------|
| 结构 | 含 CP-0、⛔ 停止标记、vdi-knowledge |
| 契约 | payload 字段与 vdi-rules 一致 |
| 行为 | MUST 缺失时输出 DATA_REQUEST 而非编造 |
| 检索 | CP 前调用规范检索（可 MCP 抽检） |

Eval workspace：`workspaces/{专业组}/skill-workspaces/{slug}/`（与 skill-creator 约定一致，**禁止**放仓库根目录）

## 新建专业 Checklist

- [ ] `workspaces/{专业组}/skills/vdi-{x}-lead` + L2/L3 目录
- [ ] `workspaces/{专业组}/skills/INDEX.md`
- [ ] `discipline-codes.json` 条目 + `status: active`
- [ ] `vdi-rules.json` data_contracts + sub_discipline_contracts
- [ ] `*-knowledge-manifest.json` + Phase 目标
- [ ] `audit-{x}-skills.mjs` + 检索回归脚本

## 禁止

- 勿在仓库根目录创建 `skills/` 或 `vdi-*-workspace/`（pre-commit 门禁会拦截）
- 勿写入 `~/.cursor/skills-cursor/`（Cursor 内置目录）
- L3 Skill 禁止输出 DisciplineOutput
- 长 CP 模板放 `references/`，勿为压行数删减专业内容（L2 建议 ~200 行，见 1012/1013）
