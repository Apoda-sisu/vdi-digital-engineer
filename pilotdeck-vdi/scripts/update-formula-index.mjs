#!/usr/bin/env node
/**
 * 更新公式索引文件
 * ================
 * 扫描所有公式文件，更新 index.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORMULAS_DIR = path.resolve(__dirname, "../data/formulas");
const INDEX_FILE = path.join(FORMULAS_DIR, "index.json");

// 扫描所有公式文件
function scanFormulaFiles(dir) {
  const formulas = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      // 递归扫描子目录
      formulas.push(...scanFormulaFiles(fullPath));
    } else if (entry.name.endsWith(".json") && entry.name !== "index.json" && entry.name !== "schema.json") {
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        if (data.formulas && Array.isArray(data.formulas)) {
          // 计算相对路径
          const relativePath = path.relative(FORMULAS_DIR, fullPath);
          formulas.push(...data.formulas.map(f => ({
            ...f,
            file: relativePath
          })));
        }
      } catch (err) {
        console.error(`读取文件失败: ${fullPath}`, err.message);
      }
    }
  }
  
  return formulas;
}

// 统计信息
function calculateStats(formulas) {
  const stats = {
    total_formulas: formulas.length,
    total_tables: 0, // 需要单独统计
    disciplines: {},
    categories: {},
    types: {}
  };
  
  for (const formula of formulas) {
    // 统计专业
    const disc = formula.discipline || "unknown";
    stats.disciplines[disc] = (stats.disciplines[disc] || 0) + 1;
    
    // 统计类别
    const cat = formula.category?.split("/")[0] || "unknown";
    stats.categories[cat] = (stats.categories[cat] || 0) + 1;
    
    // 统计类型
    const type = formula.type || "unknown";
    stats.types[type] = (stats.types[type] || 0) + 1;
  }
  
  return stats;
}

// 生成索引条目
function generateIndexEntry(formula) {
  return {
    id: formula.formula_id || formula.id,
    name: formula.name,
    discipline: formula.discipline,
    category: formula.category,
    type: formula.type,
    file: formula.file,
    source_id: formula.source?.standard_id || formula.source_id,
    clause: formula.source?.clause || formula.clause,
    inputs: formula.variables?.filter(v => v.role === "input").map(v => v.symbol) || formula.inputs || [],
    outputs: formula.variables?.filter(v => v.role === "output").map(v => v.symbol) || formula.outputs || [],
    tags: formula.tags || []
  };
}

// 主函数
function main() {
  console.log("开始更新公式索引...");
  console.log(`公式目录: ${FORMULAS_DIR}`);
  
  // 扫描所有公式
  const allFormulas = scanFormulaFiles(FORMULAS_DIR);
  console.log(`扫描到 ${allFormulas.length} 个公式`);
  
  // 计算统计信息
  const stats = calculateStats(allFormulas);
  console.log(`专业分布: ${JSON.stringify(stats.disciplines, null, 2)}`);
  console.log(`类别分布: ${JSON.stringify(stats.categories, null, 2)}`);
  
  // 生成索引
  const index = {
    schema_version: 1,
    built_at: new Date().toISOString(),
    stats: stats,
    formulas: allFormulas.map(generateIndexEntry)
  };
  
  // 写入索引文件
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
  console.log(`✅ 索引已更新: ${INDEX_FILE}`);
  console.log(`总公式数: ${stats.total_formulas}`);
  
  // 输出专业统计
  console.log("\n专业统计:");
  for (const [disc, count] of Object.entries(stats.disciplines)) {
    console.log(`  ${disc}: ${count} 个公式`);
  }
}

// 运行
main();