#!/usr/bin/env node
/** 从 formulas/index.json 重建 formula-keyword-index.json */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(ROOT, "data/formulas/index.json");
const OUT = path.join(ROOT, "data/formulas-indices/formula-keyword-index.json");
const raw = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data/cfihos-formula-id-map.json"), "utf8")
);
const ID_MAP = raw.calc_id_map || raw.id_map || {};

const idx = JSON.parse(fs.readFileSync(INDEX, "utf8"));
const kwIndex = {};

function addKeyword(kw, formulaId) {
  if (!kw || kw.length < 2) return;
  const key = kw.trim();
  if (!key) return;
  if (!kwIndex[key]) kwIndex[key] = [];
  if (!kwIndex[key].includes(formulaId)) kwIndex[key].push(formulaId);
}

for (const f of idx.formulas || []) {
  const fid = f.formula_id;
  addKeyword(f.name, fid);
  if (f.name_en) addKeyword(f.name_en, fid);
  if (f.vdi_formula_id) addKeyword(f.vdi_formula_id, fid);
  for (const tag of f.tags || []) addKeyword(tag, fid);
  if (f.category) {
    for (const part of f.category.split("/")) addKeyword(part, fid);
  }
  // 中文短词：曼宁、海曾 等
  if (f.name?.includes("曼宁")) addKeyword("曼宁", fid);
  if (f.name?.includes("海曾")) {
    addKeyword("海曾", fid);
    addKeyword("海曾-威廉姆斯", fid);
    addKeyword("海曾-威廉姆斯沿程水头损失", fid);
  }
  if (f.name_en?.includes("Hazen")) addKeyword("Hazen-Williams", fid);
  if (f.name?.includes("水泵")) addKeyword("水泵功率", fid);
  if (f.name?.includes("消防水池")) addKeyword("消防水池", fid);
  if (f.name?.includes("暴雨")) addKeyword("暴雨强度", fid);
}

// 保留 CFIHOS document-type 别名 → 计算 ID（追溯搜索，不把别名写入 index 值列表）
for (const [calcId, cfihosAlias] of Object.entries(ID_MAP)) {
  addKeyword(cfihosAlias, calcId);
}

fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      version: "2.0.0",
      generated_at: new Date().toISOString(),
      index: kwIndex,
    },
    null,
    2
  ) + "\n"
);
console.log(`✅ keyword index: ${Object.keys(kwIndex).length} 关键词 → ${OUT}`);
