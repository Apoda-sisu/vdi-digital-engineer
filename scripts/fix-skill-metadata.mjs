#!/usr/bin/env node
/**
 * 修复Skill元数据脚本
 * 补充缺失的role字段
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "skills");
const INDEX_PATH = path.join(SKILLS_DIR, "index.json");

// 读取index.json
const indexData = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));

// 遍历所有skill
for (const skill of indexData.skills) {
  const skillPath = path.join(SKILLS_DIR, skill.group, "SKILL.md");
  
  if (!fs.existsSync(skillPath)) {
    console.log(`❌ SKILL.md不存在: ${skillPath}`);
    continue;
  }
  
  let content = fs.readFileSync(skillPath, "utf8");
  
  // 检查是否已有role字段
  if (content.includes("role:")) {
    console.log(`✅ 已有role: ${skill.group}`);
    continue;
  }
  
  // 在metadata部分添加role字段
  // 在discipline或sub_discipline之后添加
  const lines = content.split("\n");
  let inMetadata = false;
  let inserted = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.trim() === "metadata:") {
      inMetadata = true;
      continue;
    }
    
    if (inMetadata && line.includes("  vdi:")) {
      continue;
    }
    
    // 在discipline或level之后添加role
    if (inMetadata && !inserted) {
      if (line.includes("    level:") || line.includes("    sub_discipline:")) {
        // 在这行之后添加role
        const indent = "    ";
        lines.splice(i + 1, 0, `${indent}role: ${skill.role}`);
        inserted = true;
        break;
      }
    }
  }
  
  if (inserted) {
    fs.writeFileSync(skillPath, lines.join("\n"));
    console.log(`✅ 已添加role: ${skill.group} -> ${skill.role}`);
  } else {
    console.log(`⚠️ 未找到插入位置: ${skill.group}`);
  }
}

console.log("\n完成！");