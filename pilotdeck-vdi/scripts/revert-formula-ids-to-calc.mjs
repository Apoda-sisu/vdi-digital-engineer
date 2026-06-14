#!/usr/bin/env node
/**
 * 公式 formula_id 回滚为计算 ID（vdi_formula_id / XX-CAT-NNN）
 * 保留 cfihos_document_type 类元数据时可写在 category，不占用主键
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPO } from "../config/skills-layout.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORMULAS_DIR = path.join(ROOT, "data/formulas");
const MAP_PATH = path.join(ROOT, "data/cfihos-formula-id-map.json");

const idMap = JSON.parse(fs.readFileSync(MAP_PATH, "utf8")).id_map;
const reverseMap = {};
for (const [calcId, cfihosId] of Object.entries(idMap)) reverseMap[cfihosId] = calcId;

function calcIdFor(formula) {
  if (formula.vdi_formula_id) return formula.vdi_formula_id;
  if (reverseMap[formula.formula_id]) return reverseMap[formula.formula_id];
  return formula.formula_id;
}

let changed = 0;
function walkFormulas(dir) {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (fs.statSync(fp).isDirectory()) walkFormulas(fp);
    else if (name.endsWith(".json") && !["schema.json", "tables.json", "index.json"].includes(name)) {
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      let fileChanged = false;
      for (const f of data.formulas || []) {
        const calc = calcIdFor(f);
        if (f.formula_id !== calc) {
          if (!f.vdi_formula_id) f.vdi_formula_id = f.formula_id;
          f.formula_id = calc;
          fileChanged = true;
          changed++;
        }
        if (f.steps) {
          for (const step of f.steps) {
            const sc = step.vdi_formula_id || reverseMap[step.formula_id] || step.formula_id;
            if (step.formula_id !== sc) {
              if (!step.vdi_formula_id) step.vdi_formula_id = step.formula_id;
              step.formula_id = sc;
              fileChanged = true;
            }
          }
        }
      }
      if (fileChanged) fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
    }
  }
}
walkFormulas(FORMULAS_DIR);

// 重建 index.json
const formulas = [];
function reindex(dir, rel = "") {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (fs.statSync(fp).isDirectory()) reindex(fp, rel ? `${rel}/${name}` : name);
    else if (name.endsWith(".json") && !["schema.json", "tables.json", "index.json"].includes(name)) {
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      for (const f of data.formulas || []) {
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
const idx = JSON.parse(fs.readFileSync(path.join(FORMULAS_DIR, "index.json"), "utf8"));
idx.formulas = formulas;
idx.stats.total_formulas = formulas.length;
const discStats = {};
for (const f of formulas) discStats[f.discipline] = (discStats[f.discipline] || 0) + 1;
idx.stats.disciplines = discStats;
fs.writeFileSync(path.join(FORMULAS_DIR, "index.json"), JSON.stringify(idx, null, 2) + "\n");

const FORMULA_DISC_TO_CFIHOS = {
  process: "PX",
  piping: "MP",
  water: "CI",
  instrument: "IN",
  electrical: "EA",
  hs: "HS",
  equipment: "MX",
};
function migrateFormulaDiscipline(dir) {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (fs.statSync(fp).isDirectory()) migrateFormulaDiscipline(fp);
    else if (name.endsWith(".json") && !["schema.json", "tables.json", "index.json"].includes(name)) {
      const data = JSON.parse(fs.readFileSync(fp, "utf8"));
      let ch = false;
      if (data.discipline && FORMULA_DISC_TO_CFIHOS[data.discipline]) {
        data.discipline = FORMULA_DISC_TO_CFIHOS[data.discipline];
        ch = true;
      }
      for (const f of data.formulas || []) {
        if (f.discipline && FORMULA_DISC_TO_CFIHOS[f.discipline]) {
          f.discipline = FORMULA_DISC_TO_CFIHOS[f.discipline];
          ch = true;
        }
      }
      if (ch) fs.writeFileSync(fp, JSON.stringify(data, null, 2) + "\n");
    }
  }
}
migrateFormulaDiscipline(FORMULAS_DIR);
formulas.length = 0;
reindex(FORMULAS_DIR);
idx.formulas = formulas;
idx.stats.total_formulas = formulas.length;
const discStats2 = {};
for (const f of formulas) discStats2[f.discipline] = (discStats2[f.discipline] || 0) + 1;
idx.stats.disciplines = discStats2;
fs.writeFileSync(path.join(FORMULAS_DIR, "index.json"), JSON.stringify(idx, null, 2) + "\n");

// Skill / references：CFIHOS 公式 ID → 计算 ID
const cfihosKeys = Object.values(idMap).sort((a, b) => b.length - a.length);
function replaceCalcIds(text) {
  let out = text;
  for (const cfihos of cfihosKeys) {
    const calc = reverseMap[cfihos];
    if (calc) out = out.split(cfihos).join(calc);
  }
  return out;
}

let skillFiles = 0;
for (const group of fs.readdirSync(path.join(REPO, "workspaces"))) {
  const skillsRoot = path.join(REPO, "workspaces", group, "skills");
  if (!fs.existsSync(skillsRoot)) continue;
  for (const fp of walk(skillsRoot)) {
    const before = fs.readFileSync(fp, "utf8");
    const after = replaceCalcIds(before);
    if (after !== before) {
      fs.writeFileSync(fp, after);
      skillFiles++;
    }
  }
}

// tables.json referenced_by
const tablesPath = path.join(FORMULAS_DIR, "tables.json");
if (fs.existsSync(tablesPath)) {
  const tables = JSON.parse(fs.readFileSync(tablesPath, "utf8"));
  for (const t of tables.tables || []) {
    if (t.referenced_by) {
      t.referenced_by = t.referenced_by.map((id) => reverseMap[id] || idMap[id] || id);
    }
  }
  fs.writeFileSync(tablesPath, JSON.stringify(tables, null, 2) + "\n");
}

// 更新 map 文件说明
fs.writeFileSync(
  MAP_PATH,
  JSON.stringify(
    {
      version: "2.0.0",
      description: "计算 ID（canonical formula_id）→ 历史 CFIHOS document-type 别名（仅追溯）",
      calc_id_map: idMap,
      reverse_map: reverseMap,
    },
    null,
    2
  ) + "\n"
);

console.log(`✅ 公式主键回滚: ${changed} 条`);
console.log(`✅ Skill/references 替换: ${skillFiles} 个文件`);
console.log("🎉 formula_id 已统一为计算 ID");

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    if (fs.statSync(fp).isDirectory()) walk(fp, files);
    else if (/\.(md|json)$/.test(name)) files.push(fp);
  }
  return files;
}
