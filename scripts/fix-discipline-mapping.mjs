#!/usr/bin/env node
/**
 * 修复专业代码映射问题
 * 在事件注册表中添加专业代码到Skill组名的映射
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// 读取事件注册表
const registryPath = path.join(ROOT, "pilotdeck-vdi/mcp/vdi-events/event-registry.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));

// 专业代码到Skill组名的映射
const disciplineCodeMapping = {
  "PR": {
    "name": "工艺",
    "skill_group": "vdi-process-lead",
    "status": "active"
  },
  "WA": {
    "name": "给排水",
    "skill_group": "vdi-water-lead",
    "status": "active"
  },
  "PI": {
    "name": "管道",
    "skill_group": null,
    "status": "pending",
    "note": "待创建管道专业Skill"
  },
  "IN": {
    "name": "仪控",
    "skill_group": null,
    "status": "pending",
    "note": "待创建仪控专业Skill"
  },
  "EL": {
    "name": "电气",
    "skill_group": null,
    "status": "pending",
    "note": "待创建电气专业Skill"
  },
  "EQ": {
    "name": "设备",
    "skill_group": null,
    "status": "pending",
    "note": "待创建设备专业Skill"
  },
  "HS": {
    "name": "HSE",
    "skill_group": null,
    "status": "pending",
    "note": "待创建HSE专业Skill"
  },
  "ST": {
    "name": "结构",
    "skill_group": null,
    "status": "pending",
    "note": "待创建结构专业Skill"
  },
  "AR": {
    "name": "建筑",
    "skill_group": null,
    "status": "pending",
    "note": "待创建建筑专业Skill"
  },
  "MA": {
    "name": "材料",
    "skill_group": null,
    "status": "pending",
    "note": "待创建材料专业Skill"
  },
  "HV": {
    "name": "暖通",
    "skill_group": null,
    "status": "pending",
    "note": "待创建暖通专业Skill"
  },
  "FI": {
    "name": "消防",
    "skill_group": null,
    "status": "pending",
    "note": "待创建消防专业Skill"
  },
  "SI": {
    "name": "总图",
    "skill_group": null,
    "status": "pending",
    "note": "待创建总图专业Skill"
  },
  "PROC": {
    "name": "采购",
    "skill_group": null,
    "status": "pending",
    "note": "待创建采购部门Skill"
  },
  "QA": {
    "name": "质量",
    "skill_group": null,
    "status": "pending",
    "note": "待创建质量部门Skill"
  },
  "MG": {
    "name": "管理",
    "skill_group": "vdi-design-manager",
    "status": "active"
  },
  "SY": {
    "name": "系统",
    "skill_group": "vdi-system-health",
    "status": "active"
  },
  "MP": {
    "name": "项目管理",
    "skill_group": "vdi-design-manager",
    "status": "active"
  }
};

// 添加映射到注册表
registry.discipline_code_mapping = disciplineCodeMapping;

// 保存更新后的注册表
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));

console.log("✅ 专业代码映射已添加到事件注册表");
console.log("\n映射关系：");
for (const [code, info] of Object.entries(disciplineCodeMapping)) {
  const status = info.status === "active" ? "✅" : "⏳";
  console.log(`${status} ${code} -> ${info.name} (${info.skill_group || "待创建"})`);
}