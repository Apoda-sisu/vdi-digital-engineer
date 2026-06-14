#!/usr/bin/env node
/** 给排水运行时专业码 WA → CFIHOS CI（唯一编解码） */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPO } from "../config/skills-layout.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");

function write(fp, content) {
  if (DRY) return console.log(`[dry-run] ${fp}`);
  fs.writeFileSync(fp, content);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (fs.statSync(fp).isDirectory()) walk(fp, files);
    else if (/\.(md|json|mjs)$/.test(name)) files.push(fp);
  }
  return files;
}

function migrateSkillText(text) {
  let out = text;
  out = out.replace(/^(\s+discipline:\s*)WA\b/gm, "$1CI");
  out = out.replace(/^(\s+branch:\s*)WA-/gm, "$1CI-");
  out = out.replace(/discipline="WA"/g, 'discipline="CI"');
  out = out.replace(/discipline='WA'/g, "discipline='CI'");
  out = out.replace(/discipline:\s*"WA"/g, 'discipline: "CI"');
  return out;
}

// 1. 给排水 Skill
const waterSkills = path.join(REPO, "workspaces/给排水组/skills");
let skillCount = 0;
for (const fp of walk(waterSkills)) {
  const before = fs.readFileSync(fp, "utf8");
  const after = migrateSkillText(before);
  if (after !== before) {
    write(fp, after);
    skillCount++;
    console.log(`✅ ${path.relative(REPO, fp)}`);
  }
}

// 2. discipline-codes.json
const codesPath = path.join(ROOT, "config/discipline-codes.json");
const codes = JSON.parse(fs.readFileSync(codesPath, "utf8"));
if (codes.mappings?.WA) {
  codes.mappings.CI = {
    ...codes.mappings.WA,
    cfihos_discipline_code: "CI",
  };
  delete codes.mappings.WA;
}
if (codes.discipline_slug_mapping) {
  codes.discipline_slug_mapping.water = "CI";
}
if (codes.canonical_discipline_policy) {
  codes.canonical_discipline_policy.exceptions = [];
  codes.canonical_discipline_policy.note =
    "全专业 metadata.vdi.discipline 使用 CFIHOS 两字母码；给排水为 CI（禁止 CFIHOS.WA 海洋工程）";
}
if (codes.vdi_to_cfihos?.WA) {
  codes.vdi_to_cfihos.WA.cfihos = "CI";
  codes.vdi_to_cfihos.WA.conflict_rules = [
    "metadata.vdi.discipline 使用 CI",
    "禁止将给排水映射为 CFIHOS.WA（海洋工程）",
  ];
}
if (codes.cfihos_to_vdi) {
  codes.cfihos_to_vdi.CI = null;
  codes._CI_note = "CI 为给排水 canonical；遗留入参 WA/water 在 resolve 层归一为 CI";
}
write(codesPath, JSON.stringify(codes, null, 2) + "\n");
console.log("✅ config/discipline-codes.json");

// 3. event-registry
const eventPath = path.join(ROOT, "mcp/vdi-events/event-registry.json");
const events = JSON.parse(fs.readFileSync(eventPath, "utf8"));
function swapWaInJson(obj) {
  if (Array.isArray(obj)) return obj.map((v) => (v === "WA" ? "CI" : swapWaInJson(v)));
  if (obj && typeof obj === "object") {
    const n = {};
    for (const [k, v] of Object.entries(obj)) {
      const nk = k === "WA" ? "CI" : k;
      n[nk] = swapWaInJson(v);
    }
    return n;
  }
  return obj === "WA" ? "CI" : obj;
}
const newEvents = swapWaInJson(events);
write(eventPath, JSON.stringify(newEvents, null, 2) + "\n");
console.log("✅ mcp/vdi-events/event-registry.json");

// 4. vdi-rules.json
const rulesPath = path.join(ROOT, "mcp/vdi-rules/vdi-rules.json");
const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
function renameWaKeys(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const n = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = k === "WA" ? "CI" : k;
    n[nk] = typeof v === "object" ? renameWaKeys(v) : v;
  }
  return n;
}
function swapWaInArray(arr) {
  return Array.isArray(arr) ? arr.map((x) => (x === "WA" ? "CI" : x)) : arr;
}
if (rules.redlines) {
  for (const r of rules.redlines) {
    if (r.discipline) r.discipline = swapWaInArray(r.discipline);
  }
}
if (rules.output_contracts?.WA) {
  rules.output_contracts.CI = rules.output_contracts.WA;
  delete rules.output_contracts.WA;
}
if (rules.data_contracts?.WA) {
  rules.data_contracts.CI = rules.data_contracts.WA;
  delete rules.data_contracts.WA;
}
write(rulesPath, JSON.stringify(rules, null, 2) + "\n");
console.log("✅ mcp/vdi-rules/vdi-rules.json");

// 5. orchestrator DEPENDENCY_GRAPH
const orchPath = path.join(ROOT, "mcp/vdi-orchestrator/server.mjs");
let orch = fs.readFileSync(orchPath, "utf8");
const beforeOrch = orch;
orch = orch.replace(/\bWA\b/g, (m, offset, s) => {
  const slice = s.slice(Math.max(0, offset - 40), offset + 40);
  if (/DEPENDENCY_GRAPH|upstream|downstream|disciplines|WA0L|给排水/.test(slice)) return "CI";
  return m;
});
if (orch !== beforeOrch) {
  write(orchPath, orch);
  console.log("✅ mcp/vdi-orchestrator/server.mjs");
}

console.log(`\n🎉 给排水 WA→CI：Skill ${skillCount} 个文件`);
