#!/usr/bin/env node
/**
 * 工艺专业 Skill + MCP 完整性审计
 * 用法: node pilotdeck-vdi/scripts/audit-process-skills.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { skillDir, indexMdForGroup, skillsRootForGroup } from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INDEX_PATH = indexMdForGroup("工艺组");
const MCP_CONFIG = path.join(ROOT, "config/mcp.json");
const FORMULAS_DIR = path.join(ROOT, "data/formulas/process");
const KNOWLEDGE = path.join(ROOT, "data/knowledge-clauses-v2.json");
const FORMULA_ID_MAP = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data/cfihos-formula-id-map.json"), "utf8")
);
const CALC_TO_CFIHOS = FORMULA_ID_MAP.calc_id_map || FORMULA_ID_MAP.id_map || {};

function resolveFormulaId(id) {
  return CALC_TO_CFIHOS[id] ? id : id;
}

function hasFormula(id) {
  return formulaIds.has(id);
}

const EXPECTED_L2 = [
  "vdi-process-package", "vdi-process-route", "vdi-process-balance",
  "vdi-process-pfd", "vdi-process-equipment", "vdi-process-pid",
  "vdi-process-hydraulics", "vdi-process-relief", "vdi-process-utilities",
  "vdi-process-control", "vdi-process-safety", "vdi-process-lab",
];
const EXPECTED_L3 = [
  "vdi-process-simulation", "vdi-process-calc",
  "vdi-process-calc-column", "vdi-process-calc-hx", "vdi-process-calc-reactor",
  "vdi-process-calc-pump", "vdi-process-calc-psv",
  "vdi-process-data-mgmt", "vdi-process-docgen",
];
const STALE_STRINGS = [
  { pattern: /PFD-PID设计(?!.*deprecated)/, exclude: ["vdi-process-pfd-pid", "deprecated"] },
  { pattern: /公用工程排放/, exclude: ["deprecated", "1008"] },
  { pattern: /code: PRFD/, exclude: ["deprecated"] },
  { pattern: /vdi-process-pfd-pid(?!.*deprecated)/, exclude: ["vdi-process-pfd-pid", "converter", "audit"] },
];

const issues = [];
const warnings = [];
const passed = [];

function ok(msg) { passed.push(msg); }
function warn(msg) { warnings.push(msg); }
function fail(msg) { issues.push(msg); }

const PROCESS_SKILLS_ROOT = skillsRootForGroup("工艺组");

function readSkillMeta(slug) {
  const dir = skillDir(slug);
  const p = dir ? path.join(dir, "SKILL.md") : "";
  if (!dir || !fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return { path: p, text, meta: {} };
  const meta = {};
  for (const line of fm[1].split("\n")) {
    const m = line.match(/^(\s+)(\w+):\s*(.+)$/);
    if (m) meta[m[2]] = m[3].replace(/^["']|["']$/g, "");
  }
  return { path: p, text, meta, yaml: fm[1] };
}

// 1. Skill 目录存在性
for (const d of ["vdi-process-lead", ...EXPECTED_L2, ...EXPECTED_L3]) {
  if (readSkillMeta(d)) ok(`Skill 存在: ${d}`);
  else fail(`Skill 缺失: ${d}/SKILL.md`);
}

// 2. 已删除 deprecated Skill
if (!readSkillMeta("vdi-process-pfd-pid")) {
  ok("vdi-process-pfd-pid 已从源目录移除");
} else {
  const deprecated = readSkillMeta("vdi-process-pfd-pid");
  if (deprecated?.yaml?.includes("deprecated: true")) warn("vdi-process-pfd-pid 仍存在（应已删除）");
  else fail("vdi-process-pfd-pid 未标记 deprecated 且未删除");
}

// 3. lead manages 覆盖
const lead = readSkillMeta("vdi-process-lead");
const leadText = lead?.text || "";
for (const name of ["工艺包与设计基础", "工艺流程图 PFD", "管道仪表流程图", "分析化验条件"]) {
  if (leadText.includes(name)) ok(`process-lead manages: ${name}`);
  else warn(`process-lead 未提及 manages: ${name}`);
}

// 4. 公式文件与 L3 formula_ids
const formulaFiles = fs.readdirSync(FORMULAS_DIR).filter(f => f.endsWith(".json"));
const formulaIds = new Set();
for (const f of formulaFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(FORMULAS_DIR, f), "utf8"));
  for (const formula of data.formulas || []) {
    formulaIds.add(formula.formula_id);
    if (formula.vdi_formula_id) formulaIds.add(formula.vdi_formula_id);
  }
}
ok(`工艺公式文件: ${formulaFiles.length} 个, ${formulaIds.size} 条公式`);

for (const l3 of ["vdi-process-calc-column", "vdi-process-calc-hx", "vdi-process-calc-reactor", "vdi-process-calc-pump", "vdi-process-calc-psv"]) {
  const s = readSkillMeta(l3);
  const ids = [...(s?.yaml?.matchAll(/formula_ids:\s*\[(.*?)\]/g) || [])][0]?.[1]?.split(",").map(x => x.trim()) || [];
  const fromYaml = s?.yaml?.match(/formula_ids:\n((?:\s+-\s+\S+\n)+)/);
  let listed = ids;
  if (fromYaml) listed = fromYaml[1].match(/-\s+(\S+)/g)?.map(x => x.replace(/^-\s+/, "")) || [];
  if (listed.length === 0) {
    const inline = s?.yaml?.match(/formula_ids:\s*\[([^\]]+)\]/);
    if (inline) listed = inline[1].split(",").map(x => x.trim());
  }
  for (const fid of listed) {
    if (hasFormula(fid)) ok(`${l3} → ${fid}`);
    else fail(`${l3} 引用缺失公式: ${fid}`);
  }
}

for (const fid of ["PR-PSV-001", "PR-COL-001", "PR-HEA-001", "PR-PMP-001"]) {
  if (hasFormula(fid)) ok(`Sprint4 公式: ${fid}`);
  else fail(`Sprint4 公式缺失: ${fid}`);
}

// 6. MCP 配置
const mcp = JSON.parse(fs.readFileSync(MCP_CONFIG, "utf8"));
for (const server of ["vdi-knowledge", "vdi-rules", "vdi-orchestrator", "vdi-events"]) {
  if (mcp.mcpServers?.[server]) ok(`MCP 已配置: ${server}`);
  else fail(`MCP 未配置: ${server}`);
}
if (mcp.mcpServers?.["vdi-cad"]) ok("MCP 已配置: vdi-cad（暂缓使用）");
else warn("MCP 未配置: vdi-cad");

// 7. 知识库工艺条文
const kb = JSON.parse(fs.readFileSync(KNOWLEDGE, "utf8"));
const procCount = kb.clauses.filter(c => c.discipline === "PX").length;
if (procCount >= 260) ok(`工艺条文: ${procCount}`);
else warn(`工艺条文偏少: ${procCount} (Phase2 目标≥450)`);

// 8. 陈旧引用扫描
const processSkills = fs.readdirSync(PROCESS_SKILLS_ROOT).filter(d => d.startsWith("vdi-process"));
for (const dir of processSkills) {
  const s = readSkillMeta(dir);
  if (!s) continue;
  for (const { pattern, exclude } of STALE_STRINGS) {
    if (!pattern.test(s.text)) continue;
    const skip = exclude.some(ex => dir.includes(ex) || s.path.includes(ex));
    if (!skip) {
      warn(`陈旧引用 ${pattern}: ${dir}`);
    }
  }
}

// 9. CAD converter（暂缓期 — 仅 warn）
const CAD_PAUSED = true;
const converter = fs.readFileSync(path.join(ROOT, "mcp/vdi-cad/converter.mjs"), "utf8");
if (converter.includes("mergeDisciplineOutputsForCad")) ok("CAD mergeDisciplineOutputsForCad 已实现");
else if (CAD_PAUSED) warn("CAD mergeDisciplineOutputsForCad 缺失（CAD 暂缓）");
else fail("CAD 缺少 mergeDisciplineOutputsForCad");
if (converter.includes('outputType === "pfd"')) ok("CAD 支持 output_type=pfd/pid");
else if (CAD_PAUSED) warn("CAD split output_type 未验证（CAD 暂缓）");
else fail("CAD 未支持 split output_type");

// 10. INDEX 同步
const index = fs.readFileSync(INDEX_PATH, "utf8");
if (index.includes("vdi-process-lab") && index.includes("PR-T03")) ok("INDEX 含 Sprint4 条目");
else warn("INDEX 可能未更新 Sprint4");

console.log("═".repeat(60));
console.log("  工艺专业 Skill + MCP 完整性审计");
console.log("═".repeat(60));
console.log(`\n✅ 通过: ${passed.length}`);
passed.slice(0, 5).forEach(p => console.log(`   · ${p}`));
if (passed.length > 5) console.log(`   ... 及 ${passed.length - 5} 项`);

if (warnings.length) {
  console.log(`\n⚠️  警告: ${warnings.length}`);
  warnings.forEach(w => console.log(`   · ${w}`));
}
if (issues.length) {
  console.log(`\n❌ 失败: ${issues.length}`);
  issues.forEach(i => console.log(`   · ${i}`));
}

console.log("\n" + "─".repeat(60));
const report = { passed: passed.length, warnings: warnings.length, failures: issues.length, details: { issues, warnings } };
fs.writeFileSync(path.join(ROOT, "tests/process-skill-audit.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`报告: pilotdeck-vdi/tests/process-skill-audit.json`);
process.exit(issues.length > 0 ? 1 : 0);
