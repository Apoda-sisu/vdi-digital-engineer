#!/usr/bin/env node
/**
 * 更新index.json中的reports_to字段
 * 确保与SKILL.md文件中的值一致
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const INDEX_PATH = path.join(SKILLS_DIR, "index.json");

// 读取现有索引
const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));

let updatedCount = 0;

// 遍历所有Skill
for (const skill of index.skills) {
  const skillPath = path.join(SKILLS_DIR, skill.group, "SKILL.md");
  
  if (!fs.existsSync(skillPath)) {
    continue;
  }
  
  const content = fs.readFileSync(skillPath, "utf8");
  
  // 提取reports_to字段
  const reportsToMatch = content.match(/reports_to:\s*(.+)/);
  if (reportsToMatch) {
    const newValue = reportsToMatch[1].trim().replace(/"/g, '');
    
    // 更新index.json
    if (skill.reports_to !== newValue) {
      console.log(`✅ ${skill.group}: reports_to "${skill.reports_to || "(空)"}" -> "${newValue}"`);
      skill.reports_to = newValue;
      updatedCount++;
    }
  }
}

// 保存更新后的索引
fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));

console.log(`\n更新完成: ${updatedCount} 个Skill`);