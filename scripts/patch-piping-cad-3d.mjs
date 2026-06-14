#!/usr/bin/env node
/** 补 vdi-piping-cad-3d evals + references + v1.2 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillDir, skillWorkspaceDir } from "../pilotdeck-vdi/config/skills-layout.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLUG = "vdi-piping-cad-3d";
const dir = skillDir(SLUG);
const ws = path.join(skillWorkspaceDir(SLUG), "skill-snapshot-v1.1-baseline");

fs.mkdirSync(ws, { recursive: true });
if (!fs.existsSync(path.join(ws, "SKILL.md"))) {
  fs.copyFileSync(path.join(dir, "SKILL.md"), path.join(ws, "SKILL.md"));
}

const tpl = `# PI-CAD 管道三维制图 — CP 输出模板

## CP-0 DATA_REQUEST
\`\`\`markdown
## ⛔ 数据缺失
缺少 equipment_tags（工艺 PFD）→ 无法建模
⛔ [CP-0 完成] — 等待人类响应
\`\`\`

## CP-1 三维模型
\`\`\`markdown
## 📋 CP-1 装置三维模型
输出 PLANT-3D-001.FCStd 路径说明
⛔ [CP-1 完成] — 等待人类响应
\`\`\`

## CP-2 校验
\`\`\`markdown
## 📐 CP-2 模型校验
vdi_validate_discipline_output / 文件存在性
⛔ [CP-2 完成] — 等待人类响应
\`\`\`
`;
fs.mkdirSync(path.join(dir, "references"), { recursive: true });
fs.writeFileSync(path.join(dir, "references/pi-cad-cp-templates.md"), tpl);

const evals = {
  skill_name: "vdi-piping-cad-3d",
  skill_display_name: "管道三维制图试点",
  deliverable_code: "PI-CAD",
  version: "1.0",
  evals: [
    {
      id: 1,
      name: "cp0-missing-equipment",
      prompt: "PI-PLANT-BASE 三维出图 CP-0。无 equipment_tags，不要编造。",
      expected_output: "DATA_REQUEST + ⛔ [CP-0 完成]",
      files: [],
      assertions: [
        { type: "text_contains_any", values: ["DATA_REQUEST", "数据缺失", "equipment"] },
        { type: "text_contains", value: "⛔ [CP-0 完成]" },
        { type: "text_not_contains", value: "⛔ [CP-1 完成]" },
      ],
    },
    {
      id: 2,
      name: "cp1-3d-draft",
      prompt: "假设 equipment_tags 已提供。仅 CP-1：说明将生成 3d 模型及输出路径，不要 CP-2。",
      expected_output: "CP-1 方案 + ⛔ [CP-1 完成]",
      files: [],
      assertions: [
        { type: "text_contains", value: "⛔ [CP-1 完成]" },
        { type: "text_not_contains", value: "⛔ [CP-2 完成]" },
      ],
    },
    {
      id: 3,
      name: "cp2-cad-output",
      prompt: "假设 CP-0/1 已确认。仅 CP-2：输出 cad_3d 或 plant3d 相关 JSON/路径摘要，提及校验，不要 CP-3。",
      expected_output: "⛔ [CP-2 完成]",
      files: [],
      assertions: [
        { type: "text_contains", value: "⛔ [CP-2 完成]" },
        { type: "text_not_contains", value: "⛔ [CP-3 完成]" },
      ],
    },
  ],
  trigger_evals: [
    { query: "管道组 plant3d 三维模型 FreeCAD", should_trigger: true },
    { query: "给水系统设计", should_trigger: false },
  ],
};
fs.mkdirSync(path.join(dir, "evals"), { recursive: true });
fs.writeFileSync(path.join(dir, "evals/evals.json"), JSON.stringify(evals, null, 2) + "\n");

let skill = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
if (!skill.includes("generation: v1.2")) {
  skill = skill.replace(/(deliverable_code: PI-CAD)\n/, "$1\n    generation: v1.2\n");
}
if (!skill.includes("pi-cad-cp-templates")) {
  skill = skill.replace(
    /(## ⚠ 执行模式[\s\S]*?\n\n)/,
    "$1## CP 输出模板（渐进披露）\n\n**输出 CP-N 前读取** [`references/pi-cad-cp-templates.md`](references/pi-cad-cp-templates.md)。\n\n"
  );
}
skill = skill.replace(/\*\*版本\*\*：[^\n]+/, "**版本**：V1.2 · 2026-06-13 · PI-M1 附录+evals");
fs.writeFileSync(path.join(dir, "SKILL.md"), skill);
console.log("✅ vdi-piping-cad-3d patched");
