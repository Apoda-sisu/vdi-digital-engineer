#!/usr/bin/env node
/**
 * SKILL / 知识库正文 / manifest 键中的 VDI formula_id → CFIHOS document-type ID
 * 用法: node pilotdeck-vdi/scripts/migrate-formula-refs-to-cfihos.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPO } from "../config/skills-layout.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");

const ID_MAP = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data/cfihos-formula-id-map.json"), "utf8")
).id_map;
const DELIVERABLE_ALIASES = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data/cfihos-deliverable-aliases.json"), "utf8")
).deliverable_aliases;

const FORMULA_KEYS = Object.keys(ID_MAP).sort((a, b) => b.length - a.length);
const DELIVERABLE_KEYS = Object.keys(DELIVERABLE_ALIASES).sort((a, b) => b.length - a.length);

function replaceFormulaIds(text) {
  let out = text;
  for (const k of FORMULA_KEYS) {
    out = out.split(k).join(ID_MAP[k]);
  }
  return out;
}

function replaceDeliverableTokens(text) {
  let out = text;
  for (const k of DELIVERABLE_KEYS) {
    out = out.split(k).join(DELIVERABLE_ALIASES[k]);
  }
  return out;
}

function migrateText(text) {
  return replaceDeliverableTokens(replaceFormulaIds(text));
}

function migrateJsonKeys(obj) {
  if (Array.isArray(obj)) return obj.map(migrateJsonKeys);
  if (!obj || typeof obj !== "object") return obj;
  const next = {};
  for (const [k, v] of Object.entries(obj)) {
    const nk = DELIVERABLE_ALIASES[k] || k;
    next[nk] = typeof v === "string" ? migrateText(v) : migrateJsonKeys(v);
  }
  return next;
}

function walkDir(dir, exts, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".git") continue;
      walkDir(fp, exts, files);
    } else if (exts.some((e) => name.endsWith(e))) files.push(fp);
  }
  return files;
}

function writeFile(fp, content) {
  if (DRY) {
    console.log(`[dry-run] ${fp}`);
    return;
  }
  fs.writeFileSync(fp, content);
}

let changed = 0;

// 1. workspaces/*/skills — SKILL.md + references
const skillRoots = fs.readdirSync(path.join(REPO, "workspaces"))
  .map((g) => path.join(REPO, "workspaces", g, "skills"))
  .filter((p) => fs.existsSync(p));

for (const root of skillRoots) {
  for (const fp of walkDir(root, [".md", ".json"])) {
    const before = fs.readFileSync(fp, "utf8");
    const after = migrateText(before);
    if (after !== before) {
      writeFile(fp, after);
      changed++;
      console.log(`✅ ${path.relative(REPO, fp)}`);
    }
  }
}

// 2. data manifests / seeds — 键 + 值
const jsonTargets = [
  "data/process-knowledge-manifest.json",
  "data/piping-knowledge-manifest.json",
  "data/water-knowledge-manifest.json",
  "data/seeds/process-knowledge-phase1.json",
  "data/seeds/process-knowledge-phase2.json",
  "data/seeds/process-knowledge-phase2f.json",
  "data/seeds/piping-knowledge-phase1.json",
  "data/seeds/piping-knowledge-phase2.json",
  "data/formulas/tables.json",
].map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));

for (const fp of jsonTargets) {
  const data = JSON.parse(fs.readFileSync(fp, "utf8"));
  const out = migrateJsonKeys(data);
  const text = JSON.stringify(out, null, 2) + "\n";
  const before = fs.readFileSync(fp, "utf8");
  if (text !== before) {
    writeFile(fp, text);
    changed++;
    console.log(`✅ ${path.relative(ROOT, fp)}`);
  }
}

// 3. knowledge-clauses 正文公式引用
const kbPath = path.join(ROOT, "data/knowledge-clauses-v2.json");
const kb = JSON.parse(fs.readFileSync(kbPath, "utf8"));
let kbChanged = false;
for (const clause of kb.clauses || []) {
  if (clause.content) {
    const nc = migrateText(clause.content);
    if (nc !== clause.content) {
      clause.content = nc;
      kbChanged = true;
    }
  }
  if (Array.isArray(clause.formula_refs)) {
    const nr = clause.formula_refs.map((r) => ID_MAP[r] || r);
    if (JSON.stringify(nr) !== JSON.stringify(clause.formula_refs)) {
      clause.formula_refs = nr;
      kbChanged = true;
    }
  }
}
if (kbChanged) {
  writeFile(kbPath, JSON.stringify(kb, null, 2) + "\n");
  changed++;
  console.log(`✅ data/knowledge-clauses-v2.json (formula refs)`);
}

console.log(`\n🎉 公式/交付物引用迁移: ${changed} 个文件${DRY ? " (dry-run)" : ""}`);
