#!/usr/bin/env node
/**
 * 技能名称中文化 — 将全部 20 个已定义 Skill + 14 个未来 Skill 的英文 name 替换为中文
 *
 * 运行方式：node pilotdeck-vdi/scripts/rename-skills-zh.mjs
 * 回滚方式：git checkout -- .
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { allSkillsRoots } from "../config/skills-layout.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

// ════════════════════════════════════════════════════════
// 名称映射表
// ════════════════════════════════════════════════════════

const NAME_MAP = {
  // ── 已定义 Skill（20 个，有 SKILL.md）──
  "vdi-water-lead":          "给排水专业负责人",
  "vdi-water-supply":        "给水系统设计",
  "vdi-water-fire":          "消防给水设计",
  "vdi-water-drainage":      "排水系统设计",
  "vdi-water-stormwater":    "雨水系统设计",
  "vdi-water-wastewater":    "污水处理设计",
  "vdi-water-circulating":   "循环水系统设计",
  "vdi-water-equipment":     "给排水设备选型",
  "vdi-water-hydraulics":    "给排水水力计算",
  "vdi-process-lead":        "工艺专业负责人",
  "vdi-process-calc":        "工艺计算",
  "vdi-process-simulation":  "流程模拟",
  "vdi-process-pfd-pid":     "PFD-PID设计",
  "vdi-process-balance":     "物料热量平衡",
  "vdi-process-route":       "工艺路线设计基础",
  "vdi-process-equipment":   "工艺设备数据表",
  "vdi-process-safety":      "工艺安全分析",
  "vdi-process-utilities":   "公用工程排放",
  "vdi-design-manager":      "设计经理",
  "vdi-scheduler-agent":     "计划调度",

  // ── 未来 Skill（14 个，event-registry 中已有引用但尚无 SKILL.md）──
  "vdi-piping-agent":        "管道设计",
  "vdi-instrument-agent":    "仪控设计",
  "vdi-electrical-agent":    "电气设计",
  "vdi-equipment-agent":     "设备设计",
  "vdi-hvac-agent":          "暖通设计",
  "vdi-fire-agent":          "消防设计",
  "vdi-hse-agent":           "HSE管理",
  "vdi-structure-agent":     "结构设计",
  "vdi-architecture-agent":  "建筑设计",
  "vdi-site-agent":          "总图设计",
  "vdi-thermal-agent":       "热工设计",
  "vdi-telecom-agent":       "电信设计",
  "vdi-qa-agent":            "质量管理",

  // ── 旧版别名 ──
  "vdi-water-agent":         "给排水专业负责人",
  "vdi-process-agent":       "工艺专业负责人",
};

// 按 key 长度降序排列，确保最长匹配优先（避免 vdi-water-supply 被 vdi-water 部分匹配）
const SORTED_KEYS = Object.keys(NAME_MAP).sort((a, b) => b.length - a.length);

// ════════════════════════════════════════════════════════
// 工具函数
// ════════════════════════════════════════════════════════

function replaceAll(str) {
  let result = str;
  for (const key of SORTED_KEYS) {
    const zh = NAME_MAP[key];
    // 仅检查 YAML frontmatter 的 name: 字段是否已被替换（避免替换标题中的中文）
    const frontmatterNameReplaced = new RegExp(`^name:\\s*${zh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm');
    if (!frontmatterNameReplaced.test(result)) {
      result = result.split(key).join(zh);
    }
  }
  return result;
}

function processFile(filePath) {
  try {
    const original = readFileSync(filePath, "utf8");
    const replaced = replaceAll(original);
    if (replaced !== original) {
      writeFileSync(filePath, replaced, "utf8");
      return { changed: true, count: countChanges(original, replaced) };
    }
    return { changed: false, count: 0 };
  } catch (err) {
    return { changed: false, count: 0, error: err.message };
  }
}

function countChanges(orig, repl) {
  let count = 0;
  for (const key of SORTED_KEYS) {
    const origCount = (orig.match(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    if (origCount > 0) count += origCount;
  }
  return count;
}

function walkDir(dir, extensions) {
  const files = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkDir(full, extensions));
    } else if (extensions.includes(extname(entry))) {
      files.push(full);
    }
  }
  return files;
}

// ════════════════════════════════════════════════════════
// 主流程
// ════════════════════════════════════════════════════════

const targets = [
  // SKILL.md 文件
  ...allSkillsRoots().flatMap((root) => walkDir(root, [".md"])),
  // MCP 服务器
  join(ROOT, "pilotdeck-vdi", "mcp", "vdi-orchestrator", "server.mjs"),
  join(ROOT, "pilotdeck-vdi", "mcp", "vdi-events", "event-registry.json"),
  // 脚本
  join(ROOT, "pilotdeck-vdi", "scripts", "e2e-pilot-a.mjs"),
  join(ROOT, "pilotdeck-vdi", "scripts", "verify-pilot-a.mjs"),
  join(ROOT, "pilotdeck-vdi", "scripts", "verify-phase0.sh"),
  join(ROOT, "pilotdeck-vdi", "scripts", "test-v2-server.mjs"),
  // 文档
  ...walkDir(join(ROOT, "docs"), [".md"]),
  join(ROOT, "项目规划书-虚拟设计院数字工程师平台.md"),
];

let totalFiles = 0;
let totalChanges = 0;
const changedFiles = [];

for (const file of targets) {
  const result = processFile(file);
  totalFiles++;
  if (result.changed) {
    totalChanges += result.count;
    changedFiles.push({ path: file.replace(ROOT + "/", ""), count: result.count });
  }
}

console.log(`技能名称中文化 — 替换完成\n`);
console.log(`扫描文件：${totalFiles}`);
console.log(`改动文件：${changedFiles.length}`);
console.log(`替换次数：${totalChanges}\n`);
console.log("改动详情：");
for (const f of changedFiles) {
  console.log(`  ${f.count.toString().padStart(3)} 处  ${f.path}`);
}
console.log(`\n回滚命令：git checkout -- .`);
