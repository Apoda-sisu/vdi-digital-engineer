#!/usr/bin/env node
/**
 * 仪控专业 IN-PLANT-BASE 全链冒烟 E2E
 * 用法: node pilotdeck-vdi/scripts/e2e-instrument-chain.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillDir, skillWorkspaceDir } from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RULES_PATH = path.join(ROOT, "mcp/vdi-rules/vdi-rules.json");

const L2_SLUGS = [
  { slug: "vdi-instrument-index", code: "IN-D01", output_type: "instrument_index" },
  { slug: "vdi-instrument-loop", code: "IN-D02", output_type: "control_loop" },
  { slug: "vdi-instrument-interlock", code: "IN-D03", output_type: "interlock" },
  { slug: "vdi-instrument-dcs", code: "IN-D04", output_type: "dcs_config" },
  { slug: "vdi-instrument-cable", code: "IN-D05", output_type: "instrument_installation" },
  { slug: "vdi-instrument-valve", code: "IN-D06", output_type: "control_valve_spec" },
  { slug: "vdi-instrument-analytical", code: "IN-D07", output_type: "analytical_instruments" },
  { slug: "vdi-instrument-telecom", code: "IN-D08", output_type: "instrument_network" },
];

const rules = JSON.parse(fs.readFileSync(RULES_PATH, "utf8"));
const inContract = rules.output_contracts?.IN;
const allowedTypes = (inContract?.note || "").match(/output_type 枚举: (.+)/)?.[1]?.split(/\s*\/\s*/) || [];

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

console.log("═".repeat(50));
console.log("  IN-PLANT-BASE 仪控全链冒烟");
console.log("═".repeat(50));

check("vdi-instrument-lead 存在", fs.existsSync(path.join(skillDir("vdi-instrument-lead") || "", "SKILL.md")));

for (const { slug, code, output_type } of L2_SLUGS) {
  const dir = skillDir(slug);
  const md = dir ? path.join(dir, "SKILL.md") : "";
  const exists = md && fs.existsSync(md);
  check(`${code} ${slug}`, exists);
  if (exists) {
    const text = fs.readFileSync(md, "utf8");
    check(`${code} deliverable_code`, text.includes(code));
    check(`${code} output_type 注册`, allowedTypes.includes(output_type), output_type);
    check(`${code} evals.json`, fs.existsSync(path.join(dir, "evals/evals.json")));
    const ws = skillWorkspaceDir(slug);
    const group = ws ? path.join(ws, "iteration-in-m1/benchmark.json") : "";
    check(`${code} IN-M1 benchmark`, group && fs.existsSync(group));
  }
}

const l1Output = {
  discipline: "IN",
  output_type: "instrument_design",
  payload: {
    instrument_index_ref: "IN-D01",
    control_loops: 3,
    safety_interlocks: 2,
    instrument_count: 120,
  },
  citations: [{ source_id: "HG/T 20507-2014", clause: "4.1" }],
  risk_level: "high",
  confidence: 0.88,
  status: "draft",
};

const missing = (inContract?.required_fields || []).filter((f) => !(f in l1Output));
check("instrument_design 必填字段", missing.length === 0, missing.join(", ") || "OK");

console.log(`\n结果: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
