#!/usr/bin/env node
/** 从 formulas 目录重建 index.json（去重） */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FORMULAS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/formulas");
const formulas = [];
const seen = new Set();

function reindex(dir, rel = "") {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (fs.statSync(fp).isDirectory()) reindex(fp, rel ? `${rel}/${name}` : name);
    else if (name.endsWith(".json") && !["schema.json", "tables.json", "index.json"].includes(name)) {
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      for (const f of data.formulas || []) {
        if (seen.has(f.formula_id)) continue;
        seen.add(f.formula_id);
        formulas.push({
          formula_id: f.formula_id,
          vdi_formula_id: f.vdi_formula_id || f.formula_id,
          name: f.name,
          discipline: f.discipline || data.discipline,
          category: f.category,
          file: rel ? `${rel}/${name}` : name,
        });
      }
    }
  }
}
reindex(FORMULAS_DIR);
const idxPath = path.join(FORMULAS_DIR, "index.json");
const idx = fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath, "utf8")) : {};
idx.formulas = formulas;
idx.stats = { ...(idx.stats || {}), total_formulas: formulas.length };
const discStats = {};
for (const f of formulas) discStats[f.discipline] = (discStats[f.discipline] || 0) + 1;
idx.stats.disciplines = discStats;
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2) + "\n");
console.log(`✅ index.json: ${formulas.length} 条（去重）`);
