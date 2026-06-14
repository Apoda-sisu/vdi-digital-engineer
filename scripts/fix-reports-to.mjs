#!/usr/bin/env node
/**
 * 修复Skill的reports_to字段
 * 将中文名称转换为group名称
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");

// 名称到group的映射
const nameToGroup = {
  "工艺专业负责人": "vdi-process-lead",
  "给排水专业负责人": "vdi-water-lead",
  "设计经理": "vdi-design-manager",
  "项目负责人": "vdi-design-manager", // 假设项目负责人就是设计经理
  "hazop-chair": "hazop-chair"
};

// 读取所有Skill目录
const skillDirs = fs.readdirSync(SKILLS_DIR)
  .filter(dir => fs.statSync(path.join(SKILLS_DIR, dir)).isDirectory());

let fixedCount = 0;

for (const skillDir of skillDirs) {
  const skillPath = path.join(SKILLS_DIR, skillDir, "SKILL.md");
  
  if (!fs.existsSync(skillPath)) {
    continue;
  }
  
  let content = fs.readFileSync(skillPath, "utf8");
  let modified = false;
  
  // 检查是否有reports_to字段
  const reportsToMatch = content.match(/reports_to:\s*(.+)/);
  if (reportsToMatch) {
    const currentValue = reportsToMatch[1].trim();
    
    // 检查是否需要转换
    if (nameToGroup[currentValue]) {
      const newValue = nameToGroup[currentValue];
      content = content.replace(
        `reports_to: ${currentValue}`,
        `reports_to: ${newValue}`
      );
      modified = true;
      fixedCount++;
      console.log(`✅ ${skillDir}: reports_to "${currentValue}" -> "${newValue}"`);
    } else if (currentValue && !currentValue.includes('vdi-') && !currentValue.includes('hazop-')) {
      // 可能是其他中文名称，需要手动检查
      console.log(`⚠️ ${skillDir}: reports_to "${currentValue}" - 需要手动检查`);
    }
  }
  
  if (modified) {
    fs.writeFileSync(skillPath, content);
  }
}

console.log(`\n修复完成: ${fixedCount} 个文件`);