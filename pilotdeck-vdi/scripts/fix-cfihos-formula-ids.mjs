#!/usr/bin/env node
/** 为每个 vdi_formula_id 分配唯一 CFIHOS document-type ID（修复 CX1380-001 冲突） */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORMULAS_DIR = path.join(ROOT, "data/formulas");
const PREFIX_MAP = JSON.parse(fs.readFileSync(path.join(ROOT, "data/cfihos-deliverable-aliases.json"), "utf8")).formula_prefix_map;

function docTypeForVdiId(id) {
  for (const [prefix, doc] of Object.entries(PREFIX_MAP).sort((a, b) => b[0].length - a[0].length)) {
    if (id.startsWith(`${prefix}-`)) return doc;
  }
  return "GEN";
}

const vdiIds = new Set();
function collect(dir) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) collect(fp);
    else if (f.endsWith(".json") && f !== "schema.json" && f !== "tables.json") {
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      for (const formula of data.formulas || []) {
        const vid = formula.vdi_formula_id || formula.formula_id;
        if (vid) vdiIds.add(vid);
      }
    }
  }
}
collect(FORMULAS_DIR);

const byDoc = {};
const idMap = {};
for (const vid of [...vdiIds].sort()) {
  const doc = docTypeForVdiId(vid);
  byDoc[doc] = (byDoc[doc] || 0) + 1;
  idMap[vid] = `${doc}-${String(byDoc[doc]).padStart(3, "0")}`;
}

function rewrite(dir) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) rewrite(fp);
    else if (f.endsWith(".json") && f !== "schema.json" && f !== "tables.json") {
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      let changed = false;
      for (const formula of data.formulas || []) {
        const vid = formula.vdi_formula_id || formula.formula_id;
        const newId = idMap[vid];
        if (newId && formula.formula_id !== newId) {
          if (!formula.vdi_formula_id) formula.vdi_formula_id = formula.formula_id;
          formula.formula_id = newId;
          changed = true;
        }
        // nested pipeline steps
        if (formula.steps) {
          for (const step of formula.steps) {
            if (step.formula_id && idMap[step.formula_id]) {
              step.vdi_formula_id = step.vdi_formula_id || step.formula_id;
              step.formula_id = idMap[step.formula_id] || idMap[step.vdi_formula_id];
              changed = true;
            }
          }
        }
      }
      if (changed) fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
    }
  }
}
rewrite(FORMULAS_DIR);

// Rebuild index from files
const formulas = [];
function reindex(dir, rel = "") {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) reindex(fp, rel ? `${rel}/${f}` : f);
    else if (f.endsWith(".json") && f !== "schema.json" && f !== "tables.json") {
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      for (const formula of data.formulas || []) {
        formulas.push({
          formula_id: formula.formula_id,
          vdi_formula_id: formula.vdi_formula_id,
          name: formula.name,
          discipline: formula.discipline || data.discipline,
          category: formula.category,
          file: rel ? `${rel}/${f}` : f,
        });
      }
    }
  }
}
reindex(FORMULAS_DIR);
const idx = JSON.parse(fs.readFileSync(path.join(FORMULAS_DIR, "index.json"), "utf8"));
idx.formulas = formulas;
idx.stats.total_formulas = formulas.length;
const discStats = {};
for (const f of formulas) discStats[f.discipline] = (discStats[f.discipline] || 0) + 1;
idx.stats.disciplines = discStats;
fs.writeFileSync(path.join(FORMULAS_DIR, "index.json"), JSON.stringify(idx, null, 2) + "\n");

fs.writeFileSync(
  path.join(ROOT, "data/cfihos-formula-id-map.json"),
  JSON.stringify({ version: "1.0.0", id_map: idMap }, null, 2) + "\n"
);
console.log(`✅ 唯一公式 ID: ${Object.keys(idMap).length} 条`);
