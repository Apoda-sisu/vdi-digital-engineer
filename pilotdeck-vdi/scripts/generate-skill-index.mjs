#!/usr/bin/env node
/**
 * 生成 workspaces/skills-registry.json — 全量 Skill 索引
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  REPO,
  SKILLS_REGISTRY,
  allSkillsRoots,
  groupForSlug,
  skillRelPath,
} from "../config/skills-layout.mjs";

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
  return fm;
}

function parseVdiYaml(yaml) {
  const vdi = {};
  const block = yaml.match(/vdi:\s*\n([\s\S]*?)(?=\n\w|\n---|$)/);
  if (!block) return vdi;
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s+(\w+):\s*(.+)/);
    if (m) vdi[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return vdi;
}

const skills = [];
for (const root of allSkillsRoots()) {
  const group = root.split("/workspaces/")[1]?.split("/")[0] || "";
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const skillMd = join(root, entry.name, "SKILL.md");
    if (!existsSync(skillMd)) continue;
    const content = readFileSync(skillMd, "utf8");
    const fm = parseFrontmatter(content);
    const yaml = content.match(/^---\n([\s\S]*?)\n---/)?.[1] || "";
    const vdi = parseVdiYaml(yaml);
    skills.push({
      slug: entry.name,
      name: fm.name || entry.name,
      path: skillRelPath(entry.name),
      workspace_group: group || groupForSlug(entry.name),
      discipline: vdi.discipline || fm.discipline || "",
      level: Number(vdi.level || fm.level) || 0,
      deliverable_code: vdi.deliverable_code || "",
      generation: vdi.generation || "",
    });
  }
}

skills.sort((a, b) => a.slug.localeCompare(b.slug));

const out = {
  version: "2.0",
  layout: "workspaces/{专业组}/skills/{slug}",
  generated: new Date().toISOString(),
  total: skills.length,
  skills,
};

writeFileSync(SKILLS_REGISTRY, JSON.stringify(out, null, 2));
console.log(`✅ ${skills.length} 个 Skill → ${SKILLS_REGISTRY.replace(REPO + "/", "")}`);
