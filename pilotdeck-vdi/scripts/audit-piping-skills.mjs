#!/usr/bin/env node
/**
 * 管道专业 Skill 完整性审计
 * 用法: node pilotdeck-vdi/scripts/audit-piping-skills.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncManifest } from "./sync-knowledge-manifest.mjs";
import { skillDir, indexMdForGroup } from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const INDEX_PATH = indexMdForGroup("管道组");
const MCP_CONFIG = path.join(ROOT, "config/mcp.json");
const KNOWLEDGE = path.join(ROOT, "data/knowledge-clauses-v2.json");
const MANIFEST = path.join(ROOT, "data/piping-knowledge-manifest.json");
const RULES = path.join(ROOT, "mcp/vdi-rules/vdi-rules.json");

const EXPECTED_L2 = [
  "vdi-piping-material-class", "vdi-piping-line-list", "vdi-piping-layout",
  "vdi-piping-equipment-connect", "vdi-piping-rack-layout", "vdi-piping-routing",
  "vdi-piping-support", "vdi-piping-stress", "vdi-piping-insulation",
  "vdi-piping-isometric", "vdi-piping-valve-spec", "vdi-piping-underground",
];
const EXPECTED_L3 = [
  "vdi-piping-hydraulics", "vdi-piping-stress-calc", "vdi-piping-corrosion-calc",
  "vdi-piping-vibration-calc", "vdi-piping-weight-calc", "vdi-piping-data-mgmt",
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

for (const d of ["vdi-piping-lead", ...EXPECTED_L2, ...EXPECTED_L3]) {
  if (readSkillMeta(d)) ok(`Skill 存在: ${d}`);
  else fail(`Skill 缺失: ${d}/SKILL.md`);
}

const lead = readSkillMeta("vdi-piping-lead");
for (const name of [
  "管道材料等级", "管道表 Line List", "管道布置", "设备管道连接",
  "管架管廊布置", "管道综合路由", "管道支架设计", "管道应力分析",
  "绝热伴热设计", "ISO 单线图", "阀门与特殊件", "地下管沟",
]) {
  if (lead?.text.includes(name)) ok(`piping-lead manages: ${name}`);
  else warn(`piping-lead 未提及: ${name}`);
}

if (lead?.yaml.includes("管道组") || lead?.text.includes("管道组")) {
  ok("piping-lead WorkSpace: 管道组");
} else {
  warn("piping-lead WorkSpace 未指向管道组");
}

for (const l2 of EXPECTED_L2) {
  const s = readSkillMeta(l2);
  if (!s) continue;
  if (s.text.includes("CP-0") && s.text.includes("⛔ [CP-")) ok(`${l2}: CP 交互模式`);
  else warn(`${l2}: 缺少 CP 交互模式标记`);
  if (s.text.includes("vdi-knowledge") || s.yaml.includes("vdi-knowledge")) ok(`${l2}: vdi-knowledge`);
  else fail(`${l2}: 未引用 vdi-knowledge`);
  if (s.text.includes("deliverable_code:") && (s.text.includes("MP") || s.text.includes("vdi_deliverable_code: PI-D"))) ok(`${l2}: deliverable_code`);
  else warn(`${l2}: 缺少 deliverable_code`);
}

for (const l3 of EXPECTED_L3) {
  const s = readSkillMeta(l3);
  if (!s) continue;
  if (s.text.includes("calc_type") || s.text.includes("公式 ID")) ok(`${l3}: 公式映射`);
  else warn(`${l3}: 缺少 calc_type/公式映射`);
  if (s.text.includes("DisciplineOutput")) warn(`${l3}: 不应输出 DisciplineOutput`);
}

const mcp = JSON.parse(fs.readFileSync(MCP_CONFIG, "utf8"));
for (const server of ["vdi-knowledge", "vdi-rules", "vdi-orchestrator"]) {
  if (mcp.mcpServers?.[server]) ok(`MCP 已配置: ${server}`);
  else fail(`MCP 未配置: ${server}`);
}

const rules = JSON.parse(fs.readFileSync(RULES, "utf8"));
const piContracts = rules.output_contracts?.MP?.sub_discipline_contracts;
if (piContracts && Object.keys(piContracts).length >= 12) {
  ok(`MP sub_discipline_contracts: ${Object.keys(piContracts).length} 项`);
} else {
  warn(`MP sub_discipline_contracts 不足: ${piContracts ? Object.keys(piContracts).length : 0}/12`);
}
if (rules.data_contracts?.MP) ok("data_contracts.MP 已定义");
else fail("缺少 data_contracts.MP");

if (fs.existsSync(KNOWLEDGE) && fs.existsSync(MANIFEST)) {
  const kb = JSON.parse(fs.readFileSync(KNOWLEDGE, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const report = syncManifest(manifest, kb.clauses, {
    write: true,
    manifestPath: MANIFEST,
  });
  const phase2Target = manifest.targets?.phase2?.clause_count || 300;
  if (report.total >= phase2Target) ok(`管道条文: ${report.total}（≥Phase2 ${phase2Target}）`);
  else if (report.total >= (manifest.targets?.phase1?.clause_count || 120)) {
    warn(`管道条文: ${report.total}（Phase2 目标 ${phase2Target}）`);
  } else warn(`管道条文偏少: ${report.total}`);

  const failTags = new Set(["MP1029", "MP1543"]);
  for (const g of report.gaps) {
    if (g.ok) ok(`知识配额 ${g.tag}: ${g.current}/${g.minimum}`);
    else if (failTags.has(g.tag)) fail(`知识配额 ${g.tag}: ${g.current}/${g.minimum}（缺 ${g.gap}）`);
    else warn(`知识配额 ${g.tag}: ${g.current}/${g.minimum}（缺 ${g.gap}）`);
  }
}

if (fs.existsSync(INDEX_PATH)) ok("管道组/skills/INDEX.md 存在");
else fail("缺少 workspaces/管道组/skills/INDEX.md");

console.log("═".repeat(60));
console.log("  管道专业 Skill 完整性审计");
console.log("═".repeat(60));
console.log(`\n✅ 通过: ${passed.length}`);
console.log(`⚠  警告: ${warnings.length}`);
console.log(`❌ 失败: ${issues.length}`);
if (warnings.length) warnings.forEach(w => console.log(`   ⚠ ${w}`));
if (issues.length) issues.forEach(i => console.log(`   ❌ ${i}`));
process.exit(issues.length > 0 ? 1 : 0);
