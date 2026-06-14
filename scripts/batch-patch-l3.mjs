#!/usr/bin/env node
/** L3 Skill 补 calc_type / formula_ids / 禁止 DisciplineOutput 声明 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { skillDir, REPO } from "../pilotdeck-vdi/config/skills-layout.mjs";

const PATCHES = [
  { skill: "vdi-water-hydraulics", formula_ids: ["WA-HYD-001", "WA-HYD-002", "WA-HYD-003", "WA-HYD-005", "WA-EQ-001"] },
  { skill: "vdi-water-equipment", formula_ids: ["WA-EQ-001", "WA-EQ-002"] },
  { skill: "vdi-piping-hydraulics", formula_ids: ["PI-HYD-001"] },
  { skill: "vdi-piping-stress-calc", formula_ids: ["PI-STR-001"] },
  { skill: "vdi-piping-corrosion-calc", formula_ids: ["PI-COR-001"] },
  { skill: "vdi-piping-vibration-calc", formula_ids: ["PI-VIB-001"] },
  { skill: "vdi-piping-weight-calc", formula_ids: ["PI-WGT-001"] },
  { skill: "vdi-process-calc-psv", formula_ids: ["PR-PSV-001"] },
  { skill: "vdi-process-calc-pump", formula_ids: ["PR-PMP-001"] },
  { skill: "vdi-process-calc-column", formula_ids: ["PR-COL-001"] },
  { skill: "vdi-process-calc-hx", formula_ids: ["PR-HX-001"] },
  { skill: "vdi-process-calc-reactor", formula_ids: ["PR-RXN-001"] },
  { skill: "vdi-doc-export", formula_ids: [], tool: true },
  { skill: "vdi-doc-ingest", formula_ids: [], tool: true },
];

for (const p of PATCHES) {
  const fp = skillDir(p.skill) ? path.join(skillDir(p.skill), "SKILL.md") : "";
  if (!fp || !fs.existsSync(fp)) continue;
  let t = fs.readFileSync(fp, "utf8");
  if (!t.includes("generation: v1.2")) {
    t = t.replace(/(level: 3\n)/, "$1    generation: v1.2\n");
  }
  if (p.formula_ids?.length && !t.includes("formula_ids:")) {
    t = t.replace(/(level: 3\n)/, `$1    formula_ids: [${p.formula_ids.map((x) => `"${x}"`).join(", ")}]\n`);
  }
  if (!t.includes("禁止产出 DisciplineOutput") && !t.includes("不输出 DisciplineOutput")) {
    const ban = "\n> 🚫 **禁止产出 DisciplineOutput** — 仅返回计算/工具结果，由 L2 整合。\n";
    t = t.replace(/(# [^\n]+\n\n)/, `$1${ban}`);
  }
  if (p.tool && !t.includes("calc_type")) {
    t = t.replace(/(generation: v1.2\n)/, "$1    calc_type: document_tool\n");
  }
  fs.writeFileSync(fp, t);
  console.log(`✅ ${p.skill}`);
}
