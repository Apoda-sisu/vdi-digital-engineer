#!/usr/bin/env node
/**
 * 修复index.json中的reports_to字段
 * 从SKILL.md文件中提取正确的值
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

// 名称到group的映射
const nameToGroup = {
  "工艺专业负责人": "vdi-process-lead",
  "给排水专业负责人": "vdi-water-lead",
  "设计经理": "vdi-design-manager",
  "项目负责人": "vdi-design-manager"
};

let fixedCount = 0;

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
    const currentValue = reportsToMatch[1].trim();
    
    // 如果是中文名称，转换为group名称
    if (nameToGroup[currentValue]) {
      const newValue = nameToGroup[currentValue];
      if (skill.reports_to !== newValue) {
        console.log(`✅ ${skill.group}: reports_to "${skill.reports_to || "(空)"}" -> "${newValue}"`);
        skill.reports_to = newValue;
        fixedCount++;
      }
    } else if (currentValue && !skill.reports_to) {
      // 如果SKILL.md中有值但index.json中没有
      console.log(`✅ ${skill.group}: reports_to "(空)" -> "${currentValue}"`);
      skill.reports_to = currentValue;
      fixedCount++;
    }
  }
}

// 保存更新后的索引
fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));

console.log(`\n修复完成: ${fixedCount} 个Skill`);