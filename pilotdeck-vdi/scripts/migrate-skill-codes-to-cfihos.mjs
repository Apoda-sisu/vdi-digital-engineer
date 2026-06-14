#!/usr/bin/env node
/**
 * 将 Skill frontmatter code 设为 CFIHOS unique code（CFIHOS-20000xxx）
 * 映射表：pilotdeck-vdi/data/skill-cfihos-unique-codes.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listAllSkillSlugs, skillDir, REPO } from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CODES_PATH = path.join(REPO, "pilotdeck-vdi", "config", "discipline-codes.json");
const UNIQUE_MAP_PATH = path.join(REPO, "pilotdeck-vdi", "data", "skill-cfihos-unique-codes.json");

function extractCodeFromFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const line = m[1].split("\n").find((l) => /^code:\s*/.test(l));
  if (!line) return null;
  return line.replace(/^code:\s*/, "").trim().replace(/^["']|["']$/g, "");
}

function setCodeInFrontmatter(content, newCode) {
  const formatted = `"${newCode}"`;
  if (/^code:\s*/m.test(content)) {
    return content.replace(/^code:\s*.+$/m, `code: ${formatted}`);
  }
  return content.replace(/^---\n/, `---\ncode: ${formatted}\n`);
}

function walkSkillMdFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walkSkillMdFiles(p, out);
    } else if (entry.name === "SKILL.md") {
      out.push(p);
    }
  }
  return out;
}

const uniqueMap = JSON.parse(fs.readFileSync(UNIQUE_MAP_PATH, "utf8"));
const skills = uniqueMap.skills;

// 校验 canonical skills 全覆盖
const slugs = listAllSkillSlugs();
const missing = slugs.filter((s) => !skills[s]);
if (missing.length) {
  console.error("缺少 CFIHOS unique code 映射:", missing.join(", "));
  process.exit(1);
}

// 构建 skill_code_map（CFIHOS unique code）
const skillCodeMap = {};
const skillCodeDetail = {};
for (const slug of slugs) {
  const entry = skills[slug];
  skillCodeMap[slug] = entry.cfihos_unique_code;
  skillCodeDetail[slug] = entry;
}

// 更新 discipline-codes.json
const codes = JSON.parse(fs.readFileSync(CODES_PATH, "utf8"));
codes.version = "1.2.0";
codes.cfihos_skill_registry = "pilotdeck-vdi/data/skill-cfihos-unique-codes.json";
codes.skill_code_map = skillCodeMap;
codes.skill_code_detail = skillCodeDetail;
codes.skill_code_format = "CFIHOS unique code（CFIHOS-20000xxx）；L1=discipline，L2/L3=discipline document type";
delete codes.skill_code_prefix_rule;
fs.writeFileSync(CODES_PATH, JSON.stringify(codes, null, 2) + "\n");
console.log(`✅ discipline-codes.json: ${Object.keys(skillCodeMap).length} 条 CFIHOS unique code`);

// 更新所有 SKILL.md
const workspaceRoot = path.join(REPO, "workspaces");
const allMd = walkSkillMdFiles(workspaceRoot);
let updated = 0;
let unchanged = 0;

for (const mdPath of allMd) {
  const rel = path.relative(workspaceRoot, mdPath);
  const slugMatch = rel.match(/skills\/([^/]+)\/SKILL\.md$/) ||
    rel.match(/skill-workspaces\/([^/]+)\/SKILL\.md$/) ||
    rel.match(/skill-workspaces\/([^/]+)\/skill-snapshot[^/]*\/SKILL\.md$/) ||
    rel.match(/\.pilotdeck\/skills\/([^/]+)\/SKILL\.md$/);

  let slug = slugMatch?.[1];
  if (!slug) {
    const oldCode = extractCodeFromFrontmatter(fs.readFileSync(mdPath, "utf8"));
    slug = slugs.find((s) => skills[s]?.cfihos_unique_code === oldCode);
    if (!slug) {
      const byLegacy = Object.entries(skillCodeMap).find(([, c]) => c === oldCode);
      if (byLegacy) slug = byLegacy[0];
    }
  }

  if (!slug || !skills[slug]) continue;

  const newCode = skills[slug].cfihos_unique_code;
  let content = fs.readFileSync(mdPath, "utf8");
  const oldCode = extractCodeFromFrontmatter(content);
  if (!oldCode) continue;
  if (oldCode === newCode) {
    unchanged++;
    continue;
  }
  content = setCodeInFrontmatter(content, newCode);
  fs.writeFileSync(mdPath, content);
  updated++;
  console.log(`  ${path.relative(REPO, mdPath)}: ${oldCode} → ${newCode}`);
}

console.log(`\n完成: ${updated} 更新, ${unchanged} 已是 CFIHOS unique code`);
