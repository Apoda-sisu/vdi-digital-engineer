#!/usr/bin/env node
/**
 * 为所有 SKILL.md 添加 discipline code 字段
 * 读取 discipline-codes.json 的 skill_code_map，注入到每个 SKILL.md 的 frontmatter
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listAllSkillSlugs, skillDir } from "../config/skills-layout.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const CODES_PATH = join(ROOT, "pilotdeck-vdi", "config", "discipline-codes.json");

const codes = JSON.parse(readFileSync(CODES_PATH, "utf8"));
const codeMap = codes.skill_code_map;

let updated = 0;
let skipped = 0;

for (const slug of listAllSkillSlugs()) {
  const dir = skillDir(slug);
  if (!dir) continue;
  const mdPath = join(dir, "SKILL.md");

  if (!codeMap[slug]) {
    console.log(`  SKIP: ${slug} (无 code 映射)`);
    skipped++;
    continue;
  }

  let content = readFileSync(mdPath, "utf8");
  if (content.includes("code:")) {
    skipped++;
    continue;
  }

  content = content.replace(/^---\n/, `---\ncode: ${codeMap[slug]}\n`);
  writeFileSync(mdPath, content);
  console.log(`  ✅ ${slug}: code=${codeMap[slug]}`);
  updated++;
}

console.log(`\n完成: ${updated} 更新, ${skipped} 跳过`);
