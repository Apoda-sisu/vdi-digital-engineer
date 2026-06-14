#!/usr/bin/env node
/** 仪控专业审计 — Skill 路径: workspaces/仪控组/skills/ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillDir, skillWorkspaceDir, indexMdForGroup } from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MCP_CONFIG = path.join(ROOT, "config/mcp.json");
const MANIFEST = path.join(ROOT, "data/instrument-knowledge-manifest.json");

const EXPECTED_L2 = [
  "vdi-instrument-index",
  "vdi-instrument-loop",
  "vdi-instrument-interlock",
  "vdi-instrument-dcs",
  "vdi-instrument-cable",
  "vdi-instrument-valve",
  "vdi-instrument-analytical",
  "vdi-instrument-telecom",
];
const EXPECTED_L3 = [
  "vdi-instrument-calc-sil",
  "vdi-instrument-selection",
  "vdi-instrument-io-count",
  "vdi-instrument-cable-mto",
];
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

for (const d of ["vdi-instrument-lead", ...EXPECTED_L2, ...EXPECTED_L3]) {
  if (readSkillMeta(d)) ok(`Skill 存在: ${d}`);
  else fail(`Skill 缺失: ${d}/SKILL.md`);
}

const lead = readSkillMeta("vdi-instrument-lead");
if (lead?.text.includes("仪控电缆与安装")) ok("instrument-lead manages: 仪控电缆与安装");
else warn("instrument-lead 未提及仪控电缆与安装");
if (lead?.text.includes("在线分析仪表")) ok("instrument-lead manages: 在线分析仪表");
else warn("instrument-lead 未提及在线分析仪表");

for (const l2 of EXPECTED_L2) {
  const s = readSkillMeta(l2);
  if (!s) continue;
  if (s.text.includes("CP-0") && s.text.includes("⛔ [CP-")) ok(`${l2}: CP 交互模式`);
  else warn(`${l2}: 缺少 CP 交互模式`);
  if (s.text.includes("设计范围")) ok(`${l2}: 设计范围边界`);
  else warn(`${l2}: 缺少设计范围边界`);
  const ev = skillDir(l2) ? path.join(skillDir(l2), "evals/evals.json") : "";
  if (ev && fs.existsSync(ev)) ok(`${l2}: evals.json`);
  else fail(`${l2}: 缺少 evals.json`);
  const bench = skillWorkspaceDir(l2)
    ? path.join(skillWorkspaceDir(l2), "iteration-in-m1/benchmark.json")
    : "";
  if (bench && fs.existsSync(bench)) ok(`${l2}: IN-M1 benchmark`);
  else warn(`${l2}: 缺少 iteration-in-m1/benchmark.json`);
}

const valve = readSkillMeta("vdi-instrument-valve");
if (valve?.text.includes("方案 A")) ok("IN-D06: 方案 A 边界已写入");
else warn("IN-D06: 未找到方案 A 边界标记");

for (const l3 of EXPECTED_L3) {
  const s = readSkillMeta(l3);
  if (!s) continue;
  if (/禁止.*DisciplineOutput|不.*产出.*DisciplineOutput/i.test(s.text)) ok(`${l3}: 禁止 DisciplineOutput`);
  else warn(`${l3}: 未声明禁止 DisciplineOutput`);
}

const mcp = JSON.parse(fs.readFileSync(MCP_CONFIG, "utf8"));
for (const server of ["vdi-knowledge", "vdi-rules", "vdi-orchestrator"]) {
  if (mcp.mcpServers?.[server]) ok(`MCP 已配置: ${server}`);
  else fail(`MCP 未配置: ${server}`);
}

if (fs.existsSync(indexMdForGroup("仪控组"))) ok("INDEX.md 存在");
else fail("缺少 workspaces/仪控组/skills/INDEX.md");

if (fs.existsSync(MANIFEST)) ok("instrument-knowledge-manifest.json");
else warn("缺少 instrument-knowledge-manifest.json");

console.log("═".repeat(60));
console.log(`✅ 通过: ${passed.length}`);
console.log(`⚠  警告: ${warnings.length}`);
console.log(`❌ 失败: ${issues.length}`);
for (const i of issues) console.log(`   ❌ ${i}`);
for (const w of warnings) console.log(`   ⚠ ${w}`);
console.log("═".repeat(60));
process.exit(issues.length ? 1 : 0);
