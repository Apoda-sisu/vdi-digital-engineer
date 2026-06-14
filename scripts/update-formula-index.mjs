#!/usr/bin/env node
/**
 * 更新公式库索引脚本
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FORMULAS_DIR = path.join(ROOT, "pilotdeck-vdi/data/formulas");
const INDEX_PATH = path.join(FORMULAS_DIR, "index.json");

// 读取现有索引
const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));

// 扫描所有公式文件
const formulas = [];
const disciplines = {};
const categories = {};
const types = {};

function scanDir(dir, prefix = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(FORMULAS_DIR, fullPath);
    
    if (entry.isDirectory()) {
      scanDir(fullPath, relativePath);
    } else if (entry.name.endsWith(".json") && entry.name !== "index.json" && entry.name !== "schema.json" && entry.name !== "tables.json") {
      try {
        const content = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        if (content.formulas && Array.isArray(content.formulas)) {
          for (const formula of content.formulas) {
            formulas.push(formula);
            
            // 统计专业
            const disc = formula.discipline || "unknown";
            disciplines[disc] = (disciplines[disc] || 0) + 1;
            
            // 统计类别
            const cat = formula.category || "unknown";
            categories[cat] = (categories[cat] || 0) + 1;
            
            // 统计类型
            const type = formula.type || "unknown";
            types[type] = (types[type] || 0) + 1;
          }
        }
      } catch (e) {
        console.error(`❌ 读取文件失败: ${relativePath}`, e.message);
      }
    }
  }
}

// 扫描公式目录
scanDir(FORMULAS_DIR);

// 按 formula_id 去重（同一公式可能出现在多个文件的历史条目中）
const seenIds = new Set();
const uniqueFormulas = [];
for (const f of formulas) {
  const id = f.formula_id;
  if (!id || seenIds.has(id)) continue;
  seenIds.add(id);
  uniqueFormulas.push(f);
}
formulas.length = 0;
formulas.push(...uniqueFormulas);

// 更新索引
index.stats.total_formulas = formulas.length;
index.stats.disciplines = disciplines;
index.stats.categories = categories;
index.stats.types = types;
index.built_at = new Date().toISOString();

// 生成公式摘要
index.formulas = formulas.map(f => ({
  formula_id: f.formula_id,
  name: f.name,
  name_en: f.name_en,
  discipline: f.discipline,
  category: f.category,
  type: f.type,
  equation_text: f.equation_text,
  variables: f.variables?.map(v => ({
    symbol: v.symbol,
    name: v.name,
    unit: v.unit,
    role: v.role
  })) || [],
  tags: f.tags || [],
  keywords: f.keywords || []
}));

// 保存索引
fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));

console.log(`✅ 公式库索引更新完成`);
console.log(`📊 总公式数: ${formulas.length}`);
console.log(`📈 各专业公式数:`);
for (const [disc, count] of Object.entries(disciplines)) {
  console.log(`   ${disc}: ${count}`);
}
console.log(`📊 各类别公式数:`);
for (const [cat, count] of Object.entries(categories)) {
  console.log(`   ${cat}: ${count}`);
}