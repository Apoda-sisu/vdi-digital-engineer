#!/usr/bin/env node
/**
 * 验收：全部 L1/L2/L3 Skill 的 frontmatter code 为 CFIHOS unique code，
 * 且与 skill-cfihos-unique-codes.json 一致。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAllSkillSlugs, skillDir, REPO, SKILLS_REGISTRY } from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UNIQUE_MAP = path.join(REPO, "pilotdeck-vdi", "data", "skill-cfihos-unique-codes.json");
const CFIHOS_PATTERN = /^CFIHOS-\d{8}$/;

const map = JSON.parse(fs.readFileSync(UNIQUE_MAP, "utf8")).skills;
const registry = JSON.parse(fs.readFileSync(SKILLS_REGISTRY, "utf8"));

function extractCode(content) {
  const m = content.match(/^code:\s*["']?(CFIHOS-\d+)/m);
  return m ? m[1] : null;
}

const slugs = listAllSkillSlugs();
const errors = [];
const byLevel = { 1: [], 2: [], 3: [] };

for (const entry of registry.skills) {
  byLevel[entry.level]?.push(entry);
}

for (const slug of slugs) {
  const reg = registry.skills.find((s) => s.slug === slug);
  const level = reg?.level ?? "?";
  const mdPath = path.join(skillDir(slug), "SKILL.md");
  const expected = map[slug]?.cfihos_unique_code;

  if (!expected) {
    errors.push(`[L${level}] ${slug}: skill-cfihos-unique-codes.json 无映射`);
    continue;
  }
  if (!CFIHOS_PATTERN.test(expected)) {
    errors.push(`[L${level}] ${slug}: 映射值非法 ${expected}`);
    continue;
  }
  const actual = extractCode(fs.readFileSync(mdPath, "utf8"));
  if (!actual) {
    errors.push(`[L${level}] ${slug}: SKILL.md 缺少 code`);
  } else if (!CFIHOS_PATTERN.test(actual)) {
    errors.push(`[L${level}] ${slug}: code 非 CFIHOS 格式 (${actual})`);
  } else if (actual !== expected) {
    errors.push(`[L${level}] ${slug}: SKILL=${actual} ≠ registry=${expected}`);
  }
}

// JSON 中多余 slug
for (const slug of Object.keys(map)) {
  if (!slugs.includes(slug)) {
    errors.push(`skill-cfihos-unique-codes.json 含非实体 Skill: ${slug}`);
  }
}

console.log("CFIHOS Skill Code 验收");
console.log(`  L1: ${byLevel[1].length}  L2: ${byLevel[2].length}  L3: ${byLevel[3].length}  合计: ${slugs.length}`);
if (errors.length) {
  console.error("\n❌ 失败", errors.length, "项:");
  for (const e of errors) console.error("  ", e);
  process.exit(1);
}
console.log("\n✅ 全部 L1/L2/L3 Skill 已赋予 CFIHOS unique code");
