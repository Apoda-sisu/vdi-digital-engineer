#!/usr/bin/env node
/**
 * @deprecated 已由 1014 V1.1 全量实体替代；仅作历史参考，勿覆盖现有 skills/
 * 仪控（IN）新店 V1.2 脚手架 — L1 + 2 L2 试点
 * 用法: node scripts/scaffold-instrument-v12.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GROUP = path.join(REPO, "workspaces/仪控组");
const SKILLS = path.join(GROUP, "skills");

function write(rel, content) {
  const full = path.join(REPO, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  console.log(`✅ ${rel}`);
}

write("workspaces/仪控组/ROUTING.md", `# 仪控组路由规则

> 消费工艺控制方案（PR-S05）与 P&ID（PR-S01）提资，输出仪表索引与联锁/SIL 设计。

## 工作空间

| 范围 | 路径 |
|------|------|
| 专业组 | \`workspaces/仪控组\` |
| 试点数据 | \`workspaces/仪控组/pilot/plant-base\` |

## 请求分类

| 请求 | Skill |
|------|-------|
| 仪表索引 / IO 清单 | 仪控仪表索引 |
| 联锁 / SIL / 因果图 | 仪控联锁设计 |
| DCS 组态详设 | → 后续 IN-D03（未建） |

## 提资依赖

\`\`\`
工艺组 PR-S01 P&ID + PR-S05 控制方案 → 仪控组 IN-D01/D02
  ├─ control_loops_summary
  ├─ cause_effect / interlock_matrix
  └─ pid_instrument_symbols
\`\`\`
`);

write("workspaces/仪控组/pilot/plant-base/design-basis/must-data.json", JSON.stringify({
  project_id: "IN-PLANT-BASE",
  instrument: {
    pid_revision: "PR-S01-R0",
    control_philosophy_ref: "PR-S05-R0",
    loop_count_estimate: 120,
    sis_required: true,
    instrument_standard: "HG/T 20507",
  },
}, null, 2) + "\n");

const leadSkill = `---
name: 仪控专业负责人
code: IN0L
description: 仪控专业设计负责人。接收设计任务，拆解仪表索引与联锁/SIL 子领域并派发给二级 Skill。触发：仪控任务下达、专业策划、进度检查、校审组织、接口协调。
metadata:
  vdi:
    discipline: IN
    role: lead
    level: 1
    generation: v1.2
    pilotdeck_workspace: /workspace/workspaces/仪控组
    mcp_required: [vdi-orchestrator, vdi-knowledge, vdi-rules]
    manages: [仪控仪表索引, 仪控联锁设计]
    may_call: [文档导出, 文档解读]
    triggers: [仪控任务下达, 仪控策划, 仪控校审, 仪控进度, 仪控接口]
---

# 仪控专业设计负责人（一级 · IN-L1 · V1.2）

## PilotDeck 集成

- **WorkSpace**：\`/workspace/workspaces/仪控组\`
- **MCP**：vdi-orchestrator、vdi-knowledge、vdi-rules
- **管理**：2 个 L2 试点（IN-D01 仪表索引、IN-D02 联锁/SIL）
- 🚫 禁止绕过二级 Skill 自行组态；禁止跳过校审闸门

## 角色定位

1. **接活**：从 design-manager 接收仪控 WBS
2. **验活**（CP-0）：校验工艺 P&ID、控制方案 MUST
3. **派活**（CP-1）：\`vdi_dispatch_task\` 至 L2
4. **审活**（CP-2/3）：三审三校，汇总 \`instrument_design\`

**详则**：[\`references/in-lead-wbs.md\`](references/in-lead-wbs.md)

## CP 协议

| CP | 步骤 | 停止 |
|----|------|------|
| **0** | MUST 校验（P&ID、控制方案） | ⛔ [CP-0 完成] — 等待人类响应 |
| **1** | 派发 IN-D01/D02 | ⛔ [CP-1 完成] — 等待人类响应 |
| **2** | 汇总校审 | ⛔ [CP-2 完成] — 等待人类响应 |
| **3** | 发布 instrument_design | ⛔ [CP-3 完成] — 等待人类响应 |

**版本**：V1.2 · 2026-06-13 · IN 新店脚手架
`;

write("workspaces/仪控组/skills/vdi-instrument-lead/SKILL.md", leadSkill);
write("workspaces/仪控组/skills/vdi-instrument-lead/references/in-lead-wbs.md", `# 仪控 L1 WBS 与三审三校

## L2 交付物

| Code | Skill | 输出 |
|------|-------|------|
| IN-D01 | vdi-instrument-index | instrument_index |
| IN-D02 | vdi-instrument-interlock | interlock / SIL |

## 三审三校要点

- 仪表位号与 P&ID 一致
- 联锁与工艺 PR-S05 因果图一致
- SIL 初评有 IEC 61511 依据
`);

function l2Skill({ slug, name, code, deliverable, display, subDisc, outputType }) {
  const cpCode = deliverable.toLowerCase().replace(/-/g, "-");
  return `---
name: ${name}
code: ${code}
description: ${display}。触发：仪表索引、IO清单、联锁、SIL、仪控设计。
metadata:
  vdi:
    discipline: IN
    sub_discipline: ${subDisc}
    branch: IN-D
    role: 分析层
    level: 2
    deliverable_code: ${deliverable}
    generation: v1.2
    reports_to: vdi-instrument-lead
    pilotdeck_workspace: /workspace/workspaces/仪控组
    mcp_required: [vdi-knowledge, vdi-rules]
    triggers: [仪表, 仪控, IO, 联锁, SIL, 索引]
---

# ${display}（二级 · ${deliverable} · V1.2）

## 规范检索（CP 前必调）

- \`IEC 61511 SIL 联锁\`
- \`HG/T 20507 仪表选型\`

CP-0：\`vdi_check_data_completeness(discipline="instrument", sub_discipline="${subDisc}")\`

## ⚠ 执行模式

1. **每个 CP 停止**；不得跨 CP 一次做完
2. **位号/联锁须有 P&ID 依据**，禁止编造
3. **SIL 计算走 IN-SIL 公式**（\`vdi_calculate\`）

## CP 输出模板（渐进披露）

**输出 CP-N 前读取** [\`references/${cpCode}-cp-templates.md\`](references/${cpCode}-cp-templates.md)。

## CP 协议

| CP | 步骤 | 停止 |
|----|------|------|
| **0** | MUST 校验 | ⛔ [CP-0 完成] — 等待人类响应 |
| **1** | 方案草案 | ⛔ [CP-1 完成] — 等待人类响应 |
| **2** | 契约 JSON + 校验 | ⛔ [CP-2 完成] — 等待人类响应 |
| **3** | 提交 instrument-lead | ⛔ [CP-3 完成] — 等待人类响应 |

## 输出契约

\`\`\`json
{
  "discipline": "IN",
  "output_type": "${outputType}",
  "payload": {},
  "citations": [],
  "risk_level": "medium",
  "status": "draft"
}
\`\`\`

**版本**：V1.2 · 2026-06-13 · IN 新店试点
`;
}

function cpTemplates(deliverable, title) {
  const c = deliverable.toLowerCase();
  return `# ${title} — CP 输出模板

## CP-0 DATA_REQUEST
\`\`\`markdown
## DATA_REQUEST
缺失 pid_revision / control_philosophy_ref → 阻断
⛔ [CP-0 完成] — 等待人类响应
\`\`\`

## CP-1 方案
\`\`\`markdown
## CP-1 方案摘要
⛔ [CP-1 完成] — 等待人类响应
\`\`\`

## CP-2 契约
\`\`\`markdown
## CP-2 契约草稿
vdi_validate_discipline_output
⛔ [CP-2 完成] — 等待人类响应
\`\`\`
`;
}

function evalsJson(slug, display, deliverable) {
  return JSON.stringify({
    skill_name: slug,
    skill_display_name: display,
    deliverable_code: deliverable,
    version: "1.0",
    evals: [
      {
        id: 1,
        name: "cp0-must-missing",
        prompt: `项目 IN-PLANT-BASE。请按 ${display} 执行 CP-0。无 pid_revision，不要编造。`,
        expected_output: "DATA_REQUEST + ⛔ [CP-0 完成]",
        files: [],
        assertions: [
          { type: "text_contains_any", values: ["DATA_REQUEST", "数据缺失"] },
          { type: "text_contains", value: "⛔ [CP-0 完成]" },
          { type: "text_not_contains", value: "⛔ [CP-1 完成]" },
        ],
      },
      {
        id: 2,
        name: "cp1-draft",
        prompt: `假设 MUST 已齐。仅 CP-1：给出方案摘要，不要 CP-2。`,
        expected_output: "⛔ [CP-1 完成]",
        files: [],
        assertions: [
          { type: "text_contains", value: "⛔ [CP-1 完成]" },
          { type: "text_not_contains", value: "⛔ [CP-2 完成]" },
        ],
      },
      {
        id: 3,
        name: "cp2-contract",
        prompt: `假设 CP-0/1 已确认。仅 CP-2：输出契约 JSON 摘要，不要 CP-3。`,
        expected_output: "⛔ [CP-2 完成]",
        files: [],
        assertions: [
          { type: "text_contains", value: "⛔ [CP-2 完成]" },
          { type: "text_not_contains", value: "⛔ [CP-3 完成]" },
        ],
      },
    ],
    trigger_evals: [
      { query: "IN-PLANT-BASE 仪表索引 IO 清单", should_trigger: true },
      { query: "给水消防设计", should_trigger: false },
    ],
  }, null, 2) + "\n";
}

const l2s = [
  { slug: "vdi-instrument-index", name: "仪控仪表索引", code: "IND1", deliverable: "IN-D01", display: "仪控仪表索引工程师", subDisc: "I", outputType: "instrument_index" },
  { slug: "vdi-instrument-interlock", name: "仪控联锁设计", code: "IND2", deliverable: "IN-D02", display: "仪控联锁与SIL工程师", subDisc: "L", outputType: "interlock" },
];

for (const s of l2s) {
  const cp = s.deliverable.toLowerCase();
  write(`workspaces/仪控组/skills/${s.slug}/SKILL.md`, l2Skill(s));
  write(`workspaces/仪控组/skills/${s.slug}/references/${cp}-cp-templates.md`, cpTemplates(s.deliverable, s.display));
  write(`workspaces/仪控组/skills/${s.slug}/evals/evals.json`, evalsJson(s.slug, s.display, s.deliverable));
}

write("workspaces/仪控组/skills/INDEX.md", `# 仪控专业 Skill 索引（V1.2 — 新店试点）

| 层级 | 数量 | 状态 |
|------|------|------|
| L1 | 1 | ✅ vdi-instrument-lead |
| L2 | 2 试点 | ✅ IN-D01/D02 + evals |

## L2 试点

| Code | 名称 | 目录 |
|------|------|------|
| IN-D01 | 仪表索引 | \`../vdi-instrument-index\` |
| IN-D02 | 联锁/SIL | \`../vdi-instrument-interlock\` |

## 验收

\`\`\`bash
node pilotdeck-vdi/scripts/audit-instrument-skills.mjs
node pilotdeck-vdi/scripts/audit-all-skills.mjs --discipline IN --strict-eval
node pilotdeck-vdi/scripts/test-instrument-knowledge-retrieval.mjs
\`\`\`
`);

console.log("\n仪控脚手架完成。请运行 generate-skill-index 与 discipline-codes 更新。");
