#!/usr/bin/env node
/**
 * 修复index.json中的manages字段
 * 将中文名称转换为group名称
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

// 创建名称到group的映射
const nameToGroup = {};
for (const skill of index.skills) {
  nameToGroup[skill.name] = skill.group;
}

console.log("名称到group的映射:");
for (const [name, group] of Object.entries(nameToGroup)) {
  console.log(`  ${name} -> ${group}`);
}

let fixedCount = 0;

// 遍历所有Skill，修复manages字段
for (const skill of index.skills) {
  if (skill.manages && skill.manages.length > 0) {
    const newManages = [];
    let changed = false;
    
    for (const managed of skill.manages) {
      if (nameToGroup[managed]) {
        // 如果是中文名称，转换为group名称
        newManages.push(nameToGroup[managed]);
        changed = true;
        console.log(`✅ ${skill.group}: manages "${managed}" -> "${nameToGroup[managed]}"`);
      } else if (index.skills.find(s => s.group === managed)) {
        // 如果已经是group名称，保持不变
        newManages.push(managed);
      } else {
        // 未知的管理对象
        newManages.push(managed);
        console.log(`⚠️ ${skill.group}: manages "${managed}" 无法识别`);
      }
    }
    
    if (changed) {
      skill.manages = newManages;
      fixedCount++;
    }
  }
}

// 保存更新后的索引
fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));

console.log(`\n修复完成: ${fixedCount} 个Skill`);