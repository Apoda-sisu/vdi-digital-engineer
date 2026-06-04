#!/usr/bin/env node
/**
 * 为所有 SKILL.md 添加 discipline code 字段
 * 读取 discipline-codes.json 的 skill_code_map，注入到每个 SKILL.md 的 frontmatter
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const SKILLS_DIR = join(ROOT, "skills");
const CODES_PATH = join(ROOT, "pilotdeck-vdi", "config", "discipline-codes.json");

const codes = JSON.parse(readFileSync(CODES_PATH, "utf8"));
const codeMap = codes.skill_code_map;

let updated = 0;
let skipped = 0;

for (const entry of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
  const slug = entry.name;
  const skillDir = join(SKILLS_DIR, slug);
  const mdPath = join(skillDir, "SKILL.md");

  if (!codeMap[slug]) {
    console.log(`  SKIP: ${slug} (无 code 映射)`);
    skipped++;
    continue;
  }

  const code = codeMap[slug].code;
  let content = readFileSync(mdPath, "utf8");

  // 检查是否已有 code 字段
  if (/^code:\s*/m.test(content)) {
    console.log(`  SKIP: ${slug} (已有 code)`);
    skipped++;
    continue;
  }

  // 在 name 字段后插入 code 字段
  content = content.replace(
    /^(name:\s*.+)$/m,
    `$1\ncode: ${code}`
  );

  writeFileSync(mdPath, content, "utf8");
  console.log(`  OK: ${slug} → ${code}`);
  updated++;
}

console.log(`\n完成: 更新 ${updated} 个, 跳过 ${skipped} 个`);
