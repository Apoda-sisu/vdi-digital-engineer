#!/usr/bin/env node
/**
 * 生成 skills/index.json — 全量 Skill 索引入口
 *
 * 用途：供 PilotDeck / 管理工具 / CI 快速发现和查询 Skill
 * 运行：node pilotdeck-vdi/scripts/generate-skill-index.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const SKILLS_DIR = join(ROOT, "skills");

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  let currentKey = "";
  for (const line of match[1].split("\n")) {
    const simple = line.match(/^(\w+):\s*(.+)/);
    if (simple) {
      currentKey = simple[1];
      fm[currentKey] = simple[2].trim();
      continue;
    }
    const list = line.match(/^\s+-\s+(.+)/);
    if (list && currentKey) {
      if (!Array.isArray(fm[currentKey])) fm[currentKey] = [];
      fm[currentKey].push(list[1].trim());
    }
  }
  // 解析嵌套 metadata.vdi
  return fm;
}

function walk(dir, result = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, result);
    } else if (entry.name === "SKILL.md") {
      const content = readFileSync(full, "utf8");
      const fm = parseFrontmatter(content);
      const relPath = relative(SKILLS_DIR, dir);
      const group = relPath.split("/")[0];
      result.push({
        name: fm.name || "unknown",
        path: "skills/" + relPath,
        group,
        discipline: fm.discipline || "",
        sub_discipline: fm.sub_discipline || "",
        level: Number(fm.level) || 0,
        role: fm.role || (fm.manages ? "lead" : ""),
        reports_to: fm.reports_to || "",
        manages: Array.isArray(fm.manages) ? fm.manages : [],
        mcp_required: Array.isArray(fm.mcp_required) ? fm.mcp_required : [],
        standalone: fm.standalone !== "false",
        triggers: Array.isArray(fm.triggers) ? fm.triggers : [],
      });
    }
  }
  return result;
}

const skills = walk(SKILLS_DIR);

const groups = {};
for (const s of skills) {
  if (!groups[s.group]) groups[s.group] = [];
  groups[s.group].push(s);
}

const index = {
  version: "1.0",
  generated: new Date().toISOString(),
  total: skills.length,
  groups: Object.keys(groups).sort(),
  breakdown: Object.fromEntries(
    Object.entries(groups).map(([k, v]) => [k, v.length])
  ),
  skills: skills.sort((a, b) => a.path.localeCompare(b.path)),
};

writeFileSync(join(SKILLS_DIR, "index.json"), JSON.stringify(index, null, 2), "utf8");
console.log(`✅ skills/index.json — ${skills.length} skills across ${Object.keys(groups).length} groups`);
for (const [group, list] of Object.entries(groups)) {
  console.log(`   ${group}: ${list.length} skills`);
}
