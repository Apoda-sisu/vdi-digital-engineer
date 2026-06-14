#!/usr/bin/env node
/**
 * 管道 12 L2 批量补 references + evals + V1.2 指针
 * 用法: node scripts/batch-scaffold-piping-v12.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  REPO,
  WORKSPACES,
  skillsRootForGroup,
  skillDir,
} from "../pilotdeck-vdi/config/skills-layout.mjs";

const SKILLS_BY_GROUP = {
  管道组: skillsRootForGroup("管道组"),
};
const DRY = process.argv.includes("--dry-run");

const L2 = [
  { skill: "vdi-piping-material-class", code: "pi-d01", deliverable: "PI-D01", sub: "M", output: "material_class", name: "管道材料等级", must: ["medium_list", "design_TP"] },
  { skill: "vdi-piping-line-list", code: "pi-d02", deliverable: "PI-D02", sub: "L", output: "line_list", name: "管道表", must: ["medium_list", "design_TP", "material_class"] },
  { skill: "vdi-piping-layout", code: "pi-d03", deliverable: "PI-D03", sub: "Y", output: "piping_layout", name: "管道布置", must: ["line_list", "plot_boundary"] },
  { skill: "vdi-piping-equipment-connect", code: "pi-d04", deliverable: "PI-D04", sub: "E", output: "equipment_connection", name: "设备接管", must: ["line_list", "equipment_nozzles"] },
  { skill: "vdi-piping-rack-layout", code: "pi-d05", deliverable: "PI-D05", sub: "R", output: "rack_layout", name: "管架管廊", must: ["piping_layout", "plot_boundary"] },
  { skill: "vdi-piping-routing", code: "pi-d06", deliverable: "PI-D06", sub: "G", output: "routing", name: "综合路由", must: ["piping_layout", "rack_layout"] },
  { skill: "vdi-piping-support", code: "pi-d07", deliverable: "PI-D07", sub: "S", output: "support", name: "支架", must: ["piping_layout", "line_list"] },
  { skill: "vdi-piping-stress", code: "pi-d08", deliverable: "PI-D08", sub: "T", output: "stress_analysis", name: "应力", must: ["line_list", "design_TP"] },
  { skill: "vdi-piping-insulation", code: "pi-d09", deliverable: "PI-D09", sub: "I", output: "insulation", name: "绝热伴热", must: ["line_list", "design_TP"] },
  { skill: "vdi-piping-isometric", code: "pi-d10", deliverable: "PI-D10", sub: "O", output: "isometric", name: "单线图", must: ["line_list", "piping_layout"] },
  { skill: "vdi-piping-valve-spec", code: "pi-d11", deliverable: "PI-D11", sub: "V", output: "valve_spec", name: "阀门", must: ["line_list", "design_TP"] },
  { skill: "vdi-piping-underground", code: "pi-d12", deliverable: "PI-D12", sub: "U", output: "underground", name: "地下管道", must: ["line_list", "plot_boundary"] },
];

function cpTemplates(item) {
  return `# ${item.deliverable} ${item.name} — CP 输出模板

> Agent **输出 CP-N 前须读取本节 CP-N 模板**；示例数值仅作版式参考。

---

## CP-0：数据完整性校验

### DATA_REQUEST（MUST 缺失）

\`\`\`markdown
## ⛔ 数据缺失 — 设计无法继续

| # | 数据项 | 应由谁提供 |
|---|--------|-----------|
${item.must.map((m, i) => `| ${i + 1} | ${m} | 上游专业/工艺 |`).join("\n")}

⛔ [CP-0 完成] — 等待人类响应
\`\`\`

### 数据完整通过

\`\`\`markdown
## ✅ CP-0 数据完整性校验通过

| 级别 | 数据项 | 状态 |
|------|--------|------|
${item.must.map((m) => `| MUST | ${m} | ✅ 已提供 |`).join("\n")}

> 回复「确认」后进入 CP-1

⛔ [CP-0 完成] — 等待人类响应
\`\`\`

---

## CP-1：方案确定

\`\`\`markdown
## 📋 CP-1 ${item.name}方案

### 方案摘要
（按规范检索结果填写）

> 回复「确认」后进入 CP-2

⛔ [CP-1 完成] — 等待人类响应
\`\`\`

---

## CP-2：计算校核

\`\`\`markdown
## 📐 CP-2 计算校核

### 校验
- vdi_validate_discipline_output → ✅/❌
- vdi_check_redlines（如适用）→ ✅/❌

⛔ [CP-2 完成] — 等待人类响应
\`\`\`

---

## CP-3：输出提交

\`\`\`markdown
## 📤 CP-3 输出提交

### DisciplineOutput
\`\`\`json
{ "discipline": "PI", "output_type": "${item.output}", "payload": {}, "citations": [], "risk_level": "medium", "confidence": 0.85, "status": "draft" }
\`\`\`

⛔ [CP-3 完成] — 等待人类响应
\`\`\`
`;
}

function evalsJson(item) {
  return {
    skill_name: item.skill,
    skill_display_name: item.name,
    deliverable_code: item.deliverable,
    version: "1.0",
    notes: `PI-M2 行为 eval · ${item.deliverable}`,
    evals: [
      {
        id: 1,
        name: "cp0-must-missing-data-request",
        prompt: `项目 PI-PLANT-BASE ${item.name}。请执行 CP-0。must-data 缺少 ${item.must[0]}。不要编造。`,
        expected_output: "DATA_REQUEST + ⛔ [CP-0 完成]；不得 CP-1",
        files: [],
        expectations: ["DATA_REQUEST 或数据缺失", `列出 ${item.must[0]}`, "⛔ [CP-0 完成]", "无 CP-1"],
        assertions: [
          { type: "text_contains_any", values: ["DATA_REQUEST", "数据缺失"] },
          { type: "text_contains", value: "⛔ [CP-0 完成]" },
          { type: "text_not_contains", value: "⛔ [CP-1 完成]" },
          { type: "text_not_contains", value: `"output_type": "${item.output}"` },
        ],
      },
      {
        id: 2,
        name: "cp0-pass-cp1-scheme",
        prompt: `PI-PLANT-BASE ${item.name}。读取 must-data.json piping 段，CP-0 通过后仅执行 CP-1 方案摘要，检索 SH/T 3059 或相关规范。`,
        expected_output: "CP-0 通过 + CP-1 方案 + ⛔ [CP-1 完成]",
        files: ["../../workspaces/管道组/pilot/plant-base/design-basis/must-data.json"],
        expectations: ["CP-0 通过", "CP-1 方案", "⛔ [CP-1 完成]", "无 CP-2"],
        assertions: [
          { type: "text_contains", value: "⛔ [CP-1 完成]" },
          { type: "text_not_contains", value: "⛔ [CP-2 完成]" },
        ],
      },
      {
        id: 3,
        name: "cp2-contract-shape",
        prompt: `PI-PLANT-BASE ${item.name}：假设 CP-0/1 已确认。仅 CP-2：输出 ${item.output} DisciplineOutput JSON 草稿，提及 vdi_validate_discipline_output，不要 CP-3。`,
        expected_output: `JSON output_type ${item.output} + ⛔ [CP-2 完成]`,
        files: [],
        expectations: [item.output, "⛔ [CP-2 完成]", "无 CP-3"],
        assertions: [
          { type: "text_contains", value: item.output },
          { type: "text_contains", value: "⛔ [CP-2 完成]" },
          { type: "text_not_contains", value: "⛔ [CP-3 完成]" },
        ],
      },
    ],
    trigger_evals: [
      { query: `PI-PLANT-BASE 做${item.name}`, should_trigger: true },
      { query: "给水系统设计 市政压力", should_trigger: false },
    ],
  };
}

function patchSkillMd(item, skillPath) {
  let text = fs.readFileSync(skillPath, "utf8");
  if (!text.includes("generation: v1.2")) {
    text = text.replace(/(deliverable_code: [^\n]+)\n/, "$1\n    generation: v1.2\n");
  }
  const refBlock = `## CP 输出模板（渐进披露）

**输出 CP-N 前，必须先读取** [\`references/${item.code}-cp-templates.md\`](references/${item.code}-cp-templates.md) **中 CP-N 对应模板**。

`;
  if (!text.includes("cp-templates")) {
    const insertAfter = text.includes("## 违规自查") ? /(## 违规自查[\s\S]*?\n\n)/ : /(## ⚠ 执行模式[\s\S]*?\n\n)/;
    text = text.replace(insertAfter, (m) => m + refBlock);
  }
  if (!text.includes("V1.2")) {
    text = text.replace(/\*\*版本\*\*：[^\n]+/, `**版本**：V1.2 · 2026-06-13 · PI-M1 附录+evals`);
  }
  return text;
}

let done = 0;
for (const item of L2) {
  const dir = path.join(SKILLS_BY_GROUP["管道组"], item.skill);
  const refsDir = path.join(dir, "references");
  const evalsDir = path.join(dir, "evals");
  const tplPath = path.join(refsDir, `${item.code}-cp-templates.md`);
  const evalPath = path.join(evalsDir, "evals.json");
  const skillPath = path.join(dir, "SKILL.md");

  if (DRY) {
    console.log(`[dry] ${item.skill}`);
    continue;
  }
  fs.mkdirSync(refsDir, { recursive: true });
  fs.mkdirSync(evalsDir, { recursive: true });
  if (!fs.existsSync(tplPath)) fs.writeFileSync(tplPath, cpTemplates(item));
  if (!fs.existsSync(evalPath)) fs.writeFileSync(evalPath, JSON.stringify(evalsJson(item), null, 2) + "\n");
  fs.writeFileSync(skillPath, patchSkillMd(item, skillPath));
  done++;
  console.log(`✅ ${item.skill} → ${item.code}-cp-templates.md + evals.json`);
}
console.log(`\n完成 ${done}/${L2.length} 个管道 L2`);
