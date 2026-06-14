#!/usr/bin/env node
/**
 * 知识库 / manifest / 规则 / 公式中的 VDI deliverable 与 formula_id → CFIHOS document type
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UNIQUE_PATH = path.join(ROOT, "data/skill-cfihos-unique-codes.json");
const DRY = process.argv.includes("--dry-run");

const FORMULA_PREFIX_TO_DOC = {
  "PI-FLOW": "MP1000",
  "PI-STR": "MP1029",
  "PI-COR": "MP1001",
  "PI-VIB": "MP1543",
  "PI-VEL": "MP1000",
  "PI-VOL": "MP1001",
  "PR-FLO": "PX1206",
  "PR-HEA": "PX1206",
  "PR-CAT": "PX1206",
  "PR-RCT": "PX1206",
  "PR-REA": "PX1206",
  "PR-SEP": "PX1206",
  "PR-VAP": "PX1206",
  "PR-COL": "PX1206",
  "PR-PMP": "PX1206",
  "PR-PSV": "PX2908",
  "WA-HYD": "CX1380",
  "WA-FIR": "HX6802",
  "WA-EQ": "CI7303",
  "WA-RAI": "CX1380",
  "WA-WQ": "CX7770",
  "IN-SEL": "IN8556",
  "IN-SIL": "IN8004",
  "HS-VEN": "CX1380",
  "EL-CAB": "EA1206",
  "EL-LIG": "EA1206",
  "EL-LOAD": "EA1206",
  "EL-POW": "EA1206",
  "EL-PRO": "EA1206",
  "EL-VOL": "EA1206",
};

function buildDeliverableAliasMap() {
  const skills = JSON.parse(fs.readFileSync(UNIQUE_PATH, "utf8")).skills || {};
  const map = {};
  for (const entry of Object.values(skills)) {
    const note = entry.mapping_note || "";
    const code = entry.document_type_short_code;
    if (!code) continue;
    const tags = note.match(/\b(WA-D\d+|WA-T\d+|PR-D\d+|PR-S\d+|PR-T\d+|PR-X\d+|PI-D\d+|PI-T\d+|IN-D\d+)\b/g);
    if (tags) for (const t of tags) map[t] = code;
  }
  return map;
}

function buildFormulaIdMap() {
  const map = {};
  for (const [prefix, doc] of Object.entries(FORMULA_PREFIX_TO_DOC)) {
    map[prefix] = doc;
  }
  return map;
}

function migrateFormulaId(id, formulaPrefixMap) {
  for (const [prefix, doc] of Object.entries(formulaPrefixMap)) {
    if (id.startsWith(`${prefix}-`)) {
      const num = id.slice(prefix.length + 1);
      return `${doc}-${num}`;
    }
  }
  return id;
}

function replaceDeliverableAliases(text, aliasMap) {
  const keys = Object.keys(aliasMap).sort((a, b) => b.length - a.length);
  let out = text;
  for (const k of keys) {
    out = out.split(k).join(aliasMap[k]);
  }
  return out;
}

function walkJson(value, aliasMap, formulaMap, stats) {
  if (Array.isArray(value)) return value.map((v) => walkJson(v, aliasMap, formulaMap, stats));
  if (value && typeof value === "object") {
    const next = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "formula_id" && typeof v === "string") {
        const nv = migrateFormulaId(v, formulaMap);
        if (nv !== v) stats.formulaIds++;
        next[k] = nv;
        if (!next.vdi_formula_id) next.vdi_formula_id = v;
      } else if (k === "id" && typeof v === "string" && /^[A-Z]{2}-[A-Z]+-\d+$/.test(v)) {
        const nv = migrateFormulaId(v, formulaMap);
        if (nv !== v) stats.formulaIds++;
        next[k] = nv;
      } else {
        next[k] = walkJson(v, aliasMap, formulaMap, stats);
      }
    }
    return next;
  }
  if (typeof value === "string") {
    const nv = replaceDeliverableAliases(value, aliasMap);
    if (nv !== value) stats.strings++;
    return nv;
  }
  return value;
}

function writeJson(file, data) {
  if (DRY) {
    console.log(`[dry-run] ${file}`);
    return;
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function processJsonFile(file, aliasMap, formulaMap) {
  const stats = { strings: 0, formulaIds: 0 };
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const out = walkJson(data, aliasMap, formulaMap, stats);
  writeJson(file, out);
  return stats;
}

function processJsonTextFile(file, aliasMap) {
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  text = replaceDeliverableAliases(text, aliasMap);
  if (!DRY && text !== before) fs.writeFileSync(file, text);
  return text !== before;
}

const aliasMap = buildDeliverableAliasMap();
const formulaMap = buildFormulaIdMap();
console.log(`交付物别名: ${Object.keys(aliasMap).length} 条`);
console.log(`公式前缀: ${Object.keys(formulaMap).length} 条`);

const jsonTargets = [
  "data/knowledge-clauses-v2.json",
  "data/piping-knowledge-manifest.json",
  "data/process-knowledge-manifest.json",
  "data/water-knowledge-manifest.json",
  "data/seeds/piping-knowledge-phase1.json",
  "data/seeds/piping-knowledge-phase2.json",
  "data/seeds/process-knowledge-phase1.json",
  "data/seeds/process-knowledge-phase2.json",
  "mcp/vdi-rules/vdi-rules.json",
  "data/formulas/index.json",
  "data/formulas-indices/formula-keyword-index.json",
  "data/module-graph.json",
].map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));

let totalFormula = 0;
let totalStrings = 0;
for (const f of jsonTargets) {
  const s = processJsonFile(f, aliasMap, f.includes("formula") || f.endsWith("vdi-rules.json") || f.includes("module-graph") ? formulaMap : {});
  totalFormula += s.formulaIds;
  totalStrings += s.strings;
  console.log(`✅ ${path.relative(ROOT, f)} (strings~${s.strings} formulaIds~${s.formulaIds})`);
}

const formulasDir = path.join(ROOT, "data/formulas");
for (const disc of fs.readdirSync(formulasDir)) {
  const discPath = path.join(formulasDir, disc);
  if (!fs.statSync(discPath).isDirectory()) continue;
  for (const file of fs.readdirSync(discPath).filter((f) => f.endsWith(".json"))) {
    const fp = path.join(discPath, file);
    const s = processJsonFile(fp, aliasMap, formulaMap);
    totalFormula += s.formulaIds;
    console.log(`✅ formulas/${disc}/${file} (${s.formulaIds} ids)`);
  }
}

writeJson(
  path.join(ROOT, "data/cfihos-deliverable-aliases.json"),
  {
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    deliverable_aliases: aliasMap,
    formula_prefix_map: FORMULA_PREFIX_TO_DOC,
  }
);

console.log(`\n合计: deliverable 替换 ~${totalStrings} 处, formula_id ${totalFormula} 条`);
console.log(DRY ? "(dry-run)" : "🎉 知识库与公式 CFIHOS 引用迁移完成");
