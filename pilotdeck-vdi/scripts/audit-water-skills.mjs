#!/usr/bin/env node
/** 给排水专业审计 — Skill 路径: workspaces/给排水组/skills/ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillDir, indexMdForGroup } from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INDEX_PATH = indexMdForGroup("给排水组");
const MCP_CONFIG = path.join(ROOT, "config/mcp.json");
const KNOWLEDGE = path.join(ROOT, "data/knowledge-clauses-v2.json");
const MANIFEST = path.join(ROOT, "data/water-knowledge-manifest.json");

const EXPECTED_L2 = [
  "vdi-water-supply", "vdi-water-fire", "vdi-water-drainage",
  "vdi-water-stormwater", "vdi-water-wastewater", "vdi-water-circulating",
];
const EXPECTED_L3 = ["vdi-water-hydraulics", "vdi-water-equipment"];

const issues = [];
const warnings = [];
const passed = [];

function ok(msg) { passed.push(msg); }
function warn(msg) { warnings.push(msg); }
function fail(msg) { issues.push(msg); }

function readSkillMeta(slug) {
  const dir = skillDir(slug);
  const p = dir ? path.join(dir, "SKILL.md") : "";
  if (!dir || !fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  return { path: p, text, yaml: fm?.[1] || "" };
}

for (const d of ["vdi-water-lead", ...EXPECTED_L2, ...EXPECTED_L3]) {
  if (readSkillMeta(d)) ok(`Skill 存在: ${d}`);
  else fail(`Skill 缺失: ${d}/SKILL.md`);
}

const lead = readSkillMeta("vdi-water-lead");
for (const name of ["给水系统设计", "消防给水设计", "排水系统设计", "雨水系统设计", "污水处理设计", "循环水系统设计"]) {
  if (lead?.text.includes(name)) ok(`water-lead manages: ${name}`);
  else warn(`water-lead 未提及: ${name}`);
}

if (lead?.yaml.includes("给排水组") || lead?.text.includes("给排水组")) {
  ok("water-lead WorkSpace: 给排水组");
} else {
  warn("water-lead WorkSpace 未指向给排水组");
}

for (const l2 of EXPECTED_L2) {
  const s = readSkillMeta(l2);
  if (!s) continue;
  if (s.text.includes("CP-0") && s.text.includes("⛔ [CP-")) ok(`${l2}: CP 交互模式`);
  else warn(`${l2}: 缺少 CP 交互模式标记`);
  if (s.text.includes("vdi-knowledge") || s.yaml.includes("vdi-knowledge")) ok(`${l2}: vdi-knowledge`);
  else fail(`${l2}: 未引用 vdi-knowledge`);
  if (s.text.includes("vdi-cad") || s.yaml.includes("vdi-cad")) warn(`${l2}: 含 vdi-cad 引用（CAD 应暂停）`);
}

const mcp = JSON.parse(fs.readFileSync(MCP_CONFIG, "utf8"));
for (const server of ["vdi-knowledge", "vdi-rules", "vdi-orchestrator"]) {
  if (mcp.mcpServers?.[server]) ok(`MCP 已配置: ${server}`);
  else fail(`MCP 未配置: ${server}`);
}

const kb = JSON.parse(fs.readFileSync(KNOWLEDGE, "utf8"));
const waterCount = kb.clauses.filter(c => c.discipline === "water").length;
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const phase3Target = manifest.targets?.phase3?.clause_count || 800;
if (waterCount >= 800) ok(`给排水条文: ${waterCount}（≥800）`);
else if (waterCount >= 700) warn(`给排水条文: ${waterCount}（接近 800，当前 ${waterCount}）`);
else warn(`给排水条文偏少: ${waterCount}`);
if (waterCount >= phase3Target * 0.95) ok(`接近 Phase3 目标 ${phase3Target}`);
else if (waterCount >= (manifest.targets?.phase2?.clause_count || 400)) ok("已达 Phase2 目标");
else warn(`Phase3 目标 ${phase3Target}，当前 ${waterCount}`);

if (fs.existsSync(INDEX_PATH)) ok("给排水组/skills/INDEX.md 存在");
else fail("缺少 workspaces/给排水组/skills/INDEX.md");

console.log("═".repeat(60));
console.log("  给排水专业 Skill 完整性审计");
console.log("═".repeat(60));
console.log(`\n✅ 通过: ${passed.length}`);
console.log(`⚠  警告: ${warnings.length}`);
console.log(`❌ 失败: ${issues.length}`);
if (warnings.length) warnings.forEach(w => console.log(`   ⚠ ${w}`));
if (issues.length) issues.forEach(i => console.log(`   ❌ ${i}`));
process.exit(issues.length > 0 ? 1 : 0);
