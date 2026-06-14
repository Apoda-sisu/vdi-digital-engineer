#!/usr/bin/env node
/**
 * 管道专业 PI-PLANT-BASE 全链冒烟 E2E
 * 用法: node pilotdeck-vdi/scripts/e2e-piping-chain.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RULES_PATH = path.join(ROOT, "mcp/vdi-rules/vdi-rules.json");

const rules = JSON.parse(fs.readFileSync(RULES_PATH, "utf8"));
const contracts = rules.output_contracts?.PI?.sub_discipline_contracts || {};

const steps = [
  {
    name: "D01 material_class",
    output_type: "material_class",
    payload: { classes: [{ class_id: "A1", max_P_MPa: 1.6, max_T_C: 200, material: "20#", corrosion_mm: 1.5 }] },
  },
  {
    name: "D02 line_list",
    output_type: "line_list",
    payload: { lines: [{ line_id: "1001-P-001", from: "V-101", to: "P-101", dn: 100, material_class: "A1" }] },
  },
  {
    name: "D03 piping_layout",
    output_type: "piping_layout",
    payload: { plan_sheets: ["PL-001"], elevation_sheets: ["EL-001"], revision: "A" },
  },
  {
    name: "D08 stress_analysis",
    output_type: "stress_analysis",
    payload: { critical_lines: ["1002-P-001"], recommendations: ["增加导向支架"] },
  },
  {
    name: "D10 isometric_spool",
    output_type: "isometric_spool",
    payload: { isometrics: ["ISO-1001-001"], test_packages: ["TP-01"] },
  },
];

let passed = 0;
let failed = 0;

console.log("═".repeat(50));
console.log("  PI-PLANT-BASE 管道全链冒烟");
console.log("═".repeat(50));

for (const step of steps) {
  const match = Object.values(contracts).find(c => c.output_type === step.output_type);
  if (!match) {
    console.log(`  ❌ ${step.name} — 无 sub_discipline_contract`);
    failed++;
    continue;
  }
  const missing = (match.required_payload_fields || []).filter(f => !(f in step.payload));
  if (missing.length === 0) {
    console.log(`  ✅ ${step.name}`);
    passed++;
  } else {
    console.log(`  ❌ ${step.name} — 缺少字段: ${missing.join(", ")}`);
    failed++;
  }
}

console.log(`\n结果: ${passed}/${steps.length}`);
process.exit(failed > 0 ? 1 : 0);
