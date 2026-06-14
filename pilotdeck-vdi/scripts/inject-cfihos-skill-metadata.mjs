#!/usr/bin/env node
/**
 * 1. 为 skill-cfihos-unique-codes.json 每条记录补充 level
 * 2. 为全部 canonical SKILL.md 的 metadata.vdi 注入 cfihos_unique_code
 * 3. 同步 discipline-codes.json skill_code_detail
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAllSkillSlugs, skillDir, REPO, SKILLS_REGISTRY } from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UNIQUE_PATH = path.join(REPO, "pilotdeck-vdi", "data", "skill-cfihos-unique-codes.json");
const CODES_PATH = path.join(REPO, "pilotdeck-vdi", "config", "discipline-codes.json");

const registry = JSON.parse(fs.readFileSync(SKILLS_REGISTRY, "utf8"));
const levelBySlug = Object.fromEntries(registry.skills.map((s) => [s.slug, s.level]));

const uniqueData = JSON.parse(fs.readFileSync(UNIQUE_PATH, "utf8"));
let enriched = 0;

for (const [slug, entry] of Object.entries(uniqueData.skills)) {
  const level = levelBySlug[slug];
  if (!level) {
    console.error(`WARN: registry 无 slug ${slug}`);
    continue;
  }
  entry.level = level;
  entry.code_tier =
    level === 1 ? "discipline" : level === 2 ? "discipline_document_type" : "discipline_document_type";
  enriched++;
}

uniqueData.version = "1.1.0";
uniqueData.summary = {
  total: enriched,
  L1: registry.skills.filter((s) => s.level === 1).length,
  L2: registry.skills.filter((s) => s.level === 2).length,
  L3: registry.skills.filter((s) => s.level === 3).length,
};

fs.writeFileSync(UNIQUE_PATH, JSON.stringify(uniqueData, null, 2) + "\n");
console.log(`✅ skill-cfihos-unique-codes.json: ${enriched} 条（L1=${uniqueData.summary.L1} L2=${uniqueData.summary.L2} L3=${uniqueData.summary.L3}）`);

function injectCfihosMetadata(yaml, entry) {
  const code = entry.cfihos_unique_code;
  const shortType = entry.document_type_short_code;
  let out = yaml;

  // 更新或插入 cfihos_unique_code
  if (/cfihos_unique_code:/.test(out)) {
    out = out.replace(/cfihos_unique_code:\s*\S+/, `cfihos_unique_code: ${code}`);
  } else if (/^\s+level:\s*\d/m.test(out)) {
    out = out.replace(/^(\s+level:\s*\d.*)$/m, `$1\n    cfihos_unique_code: ${code}`);
  } else if (/^\s+discipline:/m.test(out)) {
    out = out.replace(/^(\s+discipline:\s*\S+.*)$/m, `$1\n    cfihos_unique_code: ${code}`);
  } else {
    out = out.replace(/^(\s+vdi:\s*)$/, `$1\n    cfihos_unique_code: ${code}`);
  }

  if (/cfihos_document_type:/.test(out)) {
    out = out.replace(/cfihos_document_type:\s*\S+/, `cfihos_document_type: ${shortType}`);
  } else if (/cfihos_unique_code:/.test(out)) {
    out = out.replace(
      /^(    cfihos_unique_code:\s*\S+.*)$/m,
      `$1\n    cfihos_document_type: ${shortType}`
    );
  }
  return out;
}

let updated = 0;
for (const slug of listAllSkillSlugs()) {
  const entry = uniqueData.skills[slug];
  if (!entry) continue;
  const mdPath = path.join(skillDir(slug), "SKILL.md");
  let text = fs.readFileSync(mdPath, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) continue;

  const expectedCode = `"${entry.cfihos_unique_code}"`;
  let yaml = fm[1];

  // 确保 frontmatter code 正确
  if (/^code:/m.test(yaml)) {
    yaml = yaml.replace(/^code:\s*.+$/m, `code: ${expectedCode}`);
  } else {
    yaml = `code: ${expectedCode}\n` + yaml;
  }

  const newYaml = injectCfihosMetadata(yaml, entry);
  if (newYaml === fm[1] && text.includes(entry.cfihos_unique_code)) continue;

  text = text.replace(/^---\n[\s\S]*?\n---/, `---\n${newYaml}\n---`);
  fs.writeFileSync(mdPath, text);
  updated++;
}

console.log(`✅ canonical SKILL.md metadata 注入: ${updated} 更新`);

// discipline-codes.json
const codes = JSON.parse(fs.readFileSync(CODES_PATH, "utf8"));
codes.skill_code_map = Object.fromEntries(
  Object.entries(uniqueData.skills).map(([slug, e]) => [slug, e.cfihos_unique_code])
);
codes.skill_code_detail = uniqueData.skills;
codes.skill_code_by_level = {
  L1: registry.skills.filter((s) => s.level === 1).map((s) => ({
    slug: s.slug,
    cfihos_unique_code: uniqueData.skills[s.slug]?.cfihos_unique_code,
  })),
  L2: registry.skills.filter((s) => s.level === 2).map((s) => ({
    slug: s.slug,
    cfihos_unique_code: uniqueData.skills[s.slug]?.cfihos_unique_code,
  })),
  L3: registry.skills.filter((s) => s.level === 3).map((s) => ({
    slug: s.slug,
    cfihos_unique_code: uniqueData.skills[s.slug]?.cfihos_unique_code,
  })),
};
fs.writeFileSync(CODES_PATH, JSON.stringify(codes, null, 2) + "\n");
console.log("✅ discipline-codes.json: skill_code_by_level 已写入");
