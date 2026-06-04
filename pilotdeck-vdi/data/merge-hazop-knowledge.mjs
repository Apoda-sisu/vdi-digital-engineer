#!/usr/bin/env node
/**
 * 合并 HAZOP 知识库到主知识库
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAIN_INDEX = path.resolve(__dirname, "knowledge-clauses-v2.json");
const HAZOP_INDEX = path.resolve(__dirname, "hazop-knowledge-clauses.json");
const OUTPUT_INDEX = path.resolve(__dirname, "knowledge-clauses-v2.json");

function main() {
  console.log("开始合并 HAZOP 知识库...");

  // 读取主知识库
  const mainData = JSON.parse(fs.readFileSync(MAIN_INDEX, "utf8"));
  console.log(`  主知识库条款数：${mainData.clauses.length}`);

  // 读取 HAZOP 知识库
  const hazopData = JSON.parse(fs.readFileSync(HAZOP_INDEX, "utf8"));
  console.log(`  HAZOP 知识库条款数：${hazopData.clauses.length}`);

  // 合并条款
  mainData.clauses.push(...hazopData.clauses);

  // 合并领域词典
  if (hazopData.domain_dictionary) {
    if (!mainData.domain_dictionary) {
      mainData.domain_dictionary = {};
    }
    if (hazopData.domain_dictionary.synonyms) {
      mainData.domain_dictionary.synonyms = {
        ...mainData.domain_dictionary.synonyms,
        ...hazopData.domain_dictionary.synonyms,
      };
    }
    if (hazopData.domain_dictionary.standard_aliases) {
      mainData.domain_dictionary.standard_aliases = {
        ...mainData.domain_dictionary.standard_aliases,
        ...hazopData.domain_dictionary.standard_aliases,
      };
    }
  }

  // 更新统计信息
  mainData.stats.total_clauses = mainData.clauses.length;
  mainData.stats.mandatory = mainData.clauses.filter((c) => c.is_mandatory).length;
  mainData.stats.disciplines.hazop = hazopData.clauses.length;
  mainData.built_at = new Date().toISOString();

  // 写入合并后的知识库
  fs.writeFileSync(OUTPUT_INDEX, JSON.stringify(mainData, null, 2), "utf8");

  console.log(`\n合并完成！`);
  console.log(`  后总条款数：${mainData.clauses.length}`);
  console.log(`  输出文件：${OUTPUT_INDEX}`);
}

main();
