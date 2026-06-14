/**
 * Skill 目录布局 — 唯一真相源
 * 严禁在仓库根目录创建 skills/ 或 vdi-*-workspace/
 *
 * 规范：
 *   workspaces/{专业组}/skills/{slug}/           — 正式 Skill 源
 *   workspaces/{专业组}/skill-workspaces/{slug}/ — eval 快照与迭代产物
 *   workspaces/skills-registry.json              — 全库索引
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(__dirname, "../..");
export const WORKSPACES = path.join(REPO, "workspaces");
export const SKILLS_REGISTRY = path.join(WORKSPACES, "skills-registry.json");

/** slug → 专业组目录名 */
export const SLUG_TO_GROUP = {
  "vdi-water": "给排水组",
  "vdi-piping": "管道组",
  "vdi-process": "工艺组",
  "vdi-instrument": "仪控组",
};

const PREFIX_TO_GROUP = [
  ["vdi-water-", "给排水组"],
  ["vdi-piping-", "管道组"],
  ["vdi-process-", "工艺组"],
  ["vdi-instrument-", "仪控组"],
];

const EXACT_GROUP = {
  "vdi-design-manager": "管理组",
  "vdi-scheduler-agent": "管理组",
  "vdi-doc-export": "管理组",
  "vdi-doc-ingest": "管理组",
  "vdi-system-health": "程序检测",
  "vdi-cad-drawing": "工艺组",
  "vdi-instrument-lead": "仪控组",
};

export function groupForSlug(slug) {
  if (SLUG_TO_GROUP[slug]) return SLUG_TO_GROUP[slug];
  if (EXACT_GROUP[slug]) return EXACT_GROUP[slug];
  for (const [prefix, group] of PREFIX_TO_GROUP) {
    if (slug.startsWith(prefix)) return group;
  }
  return null;
}

export function skillsRootForGroup(group) {
  return path.join(WORKSPACES, group, "skills");
}

export function skillDir(slug) {
  const group = groupForSlug(slug);
  if (!group) return null;
  return path.join(skillsRootForGroup(group), slug);
}

export function skillWorkspaceDir(slug) {
  const group = groupForSlug(slug);
  if (!group) return null;
  return path.join(WORKSPACES, group, "skill-workspaces", slug);
}

export function indexMdForGroup(group) {
  return path.join(skillsRootForGroup(group), "INDEX.md");
}

/** 所有专业组 skills 根目录（存在且有内容的） */
export function allSkillsRoots() {
  if (!fs.existsSync(WORKSPACES)) return [];
  return fs
    .readdirSync(WORKSPACES, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => path.join(WORKSPACES, e.name, "skills"))
    .filter((p) => fs.existsSync(p));
}

/** 枚举全部实体 Skill slug（含 SKILL.md 的目录） */
export function listAllSkillSlugs() {
  const slugs = new Set();
  for (const root of allSkillsRoots()) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      if (fs.existsSync(path.join(root, entry.name, "SKILL.md"))) {
        slugs.add(entry.name);
      }
    }
  }
  return [...slugs].sort();
}

/** 相对仓库根的路径（用于 index.json） */
export function skillRelPath(slug) {
  const abs = skillDir(slug);
  if (!abs) return null;
  return path.relative(REPO, abs).split(path.sep).join("/");
}

export const USER_SCOPE_SLUGS = ["vdi-doc-export", "vdi-doc-ingest", "vdi-system-health"];

export const WORKSPACE_FILTERS = {
  工艺组: { prefix: "vdi-process-", excludeDeprecated: true },
  管道组: { prefix: "vdi-piping-", excludeDeprecated: true },
  管理组: {
    slugs: ["vdi-design-manager", "vdi-doc-export", "vdi-doc-ingest", "vdi-scheduler-agent"],
    excludeDeprecated: true,
  },
  给排水组: { prefix: "vdi-water-", excludeDeprecated: true },
  仪控组: { prefix: "vdi-instrument-", excludeDeprecated: true },
  程序检测: { slugs: ["vdi-system-health"], excludeDeprecated: true },
};
