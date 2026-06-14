#!/usr/bin/env node
/**
 * 同步 Skill 与知识库索引到 PilotDeck 工作空间
 *
 * 问题：PilotDeck 打开项目时展示 `<project>/.pilotdeck/skills/` 中的项目级 Skill；
 *       全局 `~/.pilotdeck/skills/` 虽已 bind-mount 到 repo/skills，但各 workspace
 *       下的副本可能滞后，导致 UI 看不到 Sprint 2–4 新增的工艺 Skill。
 *
 * 用法:
 *   node pilotdeck-vdi/scripts/sync-pilotdeck-workspace.mjs
 *   node pilotdeck-vdi/scripts/sync-pilotdeck-workspace.mjs --workspace 工艺组
 *   node pilotdeck-vdi/scripts/sync-pilotdeck-workspace.mjs --all-workspaces
 *   node pilotdeck-vdi/scripts/sync-pilotdeck-workspace.mjs --restart
 */

import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  REPO,
  WORKSPACES,
  WORKSPACE_FILTERS,
  USER_SCOPE_SLUGS,
  skillDir,
  skillsRootForGroup,
} from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const WORKSPACES_ROOT = WORKSPACES;

const args = process.argv.slice(2);
const restart = args.includes("--restart");
const allWorkspaces = args.includes("--all-workspaces");
const wsFilter = args.includes("--workspace")
  ? args[args.indexOf("--workspace") + 1]
  : null;

/** 默认只同步工艺组 */
const DEFAULT_TARGETS = ["工艺组"];

const ALL_WORKSPACE_TARGETS = Object.keys(WORKSPACE_FILTERS);
const USER_SKILLS_DIR = path.join(ROOT, "pilotdeck-vdi/pilotdeck-user-skills");

function workspaceSkillsSrc(wsPath) {
  return path.join(wsPath, "skills");
}

function isDeprecatedSkill(skillDir) {
  const md = path.join(skillDir, "SKILL.md");
  if (!existsSync(md)) return false;
  const content = readFileSync(md, "utf8");
  return /deprecated:\s*true/i.test(content);
}

function listSkillSlugs(dir, { prefix = null, slugs = null, excludeDeprecated = false } = {}) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .filter((e) => existsSync(path.join(dir, e.name, "SKILL.md")))
    .filter((e) => !prefix || e.name.startsWith(prefix))
    .filter((e) => !slugs || slugs.includes(e.name))
    .filter((e) => !excludeDeprecated || !isDeprecatedSkill(path.join(dir, e.name)))
    .map((e) => e.name)
    .sort();
}

function findExistingSkillRoots() {
  const roots = new Set();
  if (!existsSync(WORKSPACES)) return [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === "skills" && dir.endsWith(".pilotdeck")) {
        roots.add(path.dirname(dir));
        continue;
      }
      walk(full);
    }
  };
  walk(WORKSPACES);
  return [...roots].sort();
}

function resolveTargets() {
  const targets = new Set();
  if (wsFilter) {
    targets.add(path.join(WORKSPACES, wsFilter));
  } else if (allWorkspaces) {
    for (const rel of ALL_WORKSPACE_TARGETS) {
      targets.add(path.join(WORKSPACES, rel));
    }
  } else {
    for (const rel of DEFAULT_TARGETS) {
      targets.add(path.join(WORKSPACES, rel));
    }
  }
  return [...targets];
}

function skillFilterForWorkspace(wsPath) {
  const rel = path.relative(WORKSPACES, wsPath).replace(/\\/g, "/");
  return WORKSPACE_FILTERS[rel] || { prefix: null, excludeDeprecated: true };
}

function copySkill(slug, srcRoot, destRoot) {
  const src = path.join(srcRoot, slug);
  const dest = path.join(destRoot, slug);
  cpSync(src, dest, { recursive: true, force: true });
}

function syncSkillsToWorkspace(wsPath, slugs) {
  const srcRoot = workspaceSkillsSrc(wsPath);
  const destRoot = path.join(wsPath, ".pilotdeck", "skills");
  mkdirSync(destRoot, { recursive: true });

  let copied = 0;
  for (const slug of slugs) {
    copySkill(slug, srcRoot, destRoot);
    copied++;
  }

  // 移除目标中已不存在于源目录的 Skill 副本（仅删目录，不动 index.json）
  const stale = [];
  if (existsSync(destRoot)) {
    for (const entry of readdirSync(destRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!slugs.includes(entry.name)) {
        const stalePath = path.join(destRoot, entry.name);
        if (existsSync(path.join(stalePath, "SKILL.md"))) {
          stale.push(entry.name);
          rmSync(stalePath, { recursive: true, force: true });
        }
      }
    }
  }

  return { copied, stale, destRoot };
}

function syncUserScopeSkills() {
  mkdirSync(USER_SKILLS_DIR, { recursive: true });
  const stale = [];
  for (const slug of USER_SCOPE_SLUGS) {
    const src = skillDir(slug);
    if (!src) continue;
    cpSync(src, path.join(USER_SKILLS_DIR, slug), { recursive: true, force: true });
  }
  if (existsSync(USER_SKILLS_DIR)) {
    for (const entry of readdirSync(USER_SKILLS_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!USER_SCOPE_SLUGS.includes(entry.name)) {
        const stalePath = path.join(USER_SKILLS_DIR, entry.name);
        if (existsSync(path.join(stalePath, "SKILL.md"))) {
          stale.push(entry.name);
          rmSync(stalePath, { recursive: true, force: true });
        }
      }
    }
  }
  return { copied: USER_SCOPE_SLUGS.length, stale, destRoot: USER_SKILLS_DIR };
}

function updateSkillIndex() {
  const gen = path.join(__dirname, "generate-skill-index.mjs");
  execSync(`node "${gen}"`, { stdio: "inherit", cwd: ROOT });
  return true;
}

function knowledgeStats() {
  const v2 = path.join(ROOT, "pilotdeck-vdi/data/knowledge-clauses-v2.json");
  if (!existsSync(v2)) return null;
  const data = JSON.parse(readFileSync(v2, "utf8"));
  const clauses = data.clauses || data;
  const processCount = Array.isArray(clauses)
    ? clauses.filter((c) => c.discipline === "process" || c.discipline === "PR").length
    : 0;
  return { total: Array.isArray(clauses) ? clauses.length : 0, process: processCount };
}

function restartServices() {
  try {
    execSync("docker restart pilotdeck-pilotdeck-1 vdi-knowledge", {
      stdio: "inherit",
    });
    console.log("\n✅ 已重启 pilotdeck + vdi-knowledge 容器");
  } catch (e) {
    console.warn("\n⚠️  容器重启失败（可手动 docker restart pilotdeck-pilotdeck-1）");
  }
}

// ── main ──
console.log("═".repeat(56));
console.log("  PilotDeck 工作空间同步 — Skill + 知识库");
console.log("═".repeat(56));

console.log("\n[1/3] 更新 workspaces/skills-registry.json …");
updateSkillIndex();

console.log("\n[2/4] 同步用户技能（pilotdeck-user-skills，仅跨专业工具）…");
const userSync = syncUserScopeSkills();
console.log(
  `  ✅ 用户技能 ${userSync.copied} 个: ${USER_SCOPE_SLUGS.join(", ")}` +
    (userSync.stale.length ? `, 移除 ${userSync.stale.length} 个: ${userSync.stale.join(", ")}` : "")
);

let totalSkillCount = 0;
console.log(`\n[3/4] 同步项目技能 workspace/skills → .pilotdeck/skills …`);

const targets = resolveTargets();
const report = [];

for (const wsPath of targets) {
  if (!existsSync(wsPath)) {
    mkdirSync(wsPath, { recursive: true });
  }
  const filter = skillFilterForWorkspace(wsPath);
  const srcRoot = workspaceSkillsSrc(wsPath);
  const slugs = listSkillSlugs(srcRoot, filter);
  totalSkillCount += slugs.length;
  const { copied, stale, destRoot } = syncSkillsToWorkspace(wsPath, slugs);
  report.push({
    workspace: path.relative(WORKSPACES, wsPath),
    dest: destRoot,
    copied,
    filter,
    removed: stale.length,
    stale,
    slugs,
  });
  const filterNote = filter.prefix ? ` [${filter.prefix}*]` : "";
  console.log(
    `  ✅ ${path.relative(WORKSPACES, wsPath)} — ${copied} skills${filterNote}` +
      (stale.length ? `, 移除 ${stale.length} 个: ${stale.join(", ")}` : "")
  );
}

const kb = knowledgeStats();
console.log("\n[4/4] 知识库状态（bind-mount 已实时生效）");
if (kb) {
  console.log(`  全库 ${kb.total} 条 | 工艺 ${kb.process} 条`);
  console.log(`  路径: pilotdeck-vdi/data/knowledge-clauses-v2.json`);
}

writeFileSync(
  path.join(ROOT, "pilotdeck-vdi/tests/pilotdeck-sync-report.json"),
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      skill_count: totalSkillCount,
      process_skills: report.flatMap((r) => r.slugs).filter((s) => s.startsWith("vdi-process-")),
      user_scope: { slugs: USER_SCOPE_SLUGS, ...userSync },
      workspaces: report,
      knowledge: kb,
    },
    null,
    2
  ),
  "utf8"
);

console.log("\n" + "═".repeat(56));
console.log("  同步完成");
console.log(`  报告: pilotdeck-vdi/tests/pilotdeck-sync-report.json`);
console.log("  请在 PilotDeck 中：");
console.log("    1. 刷新页面（或 Skills 页点 Refresh）");
console.log("    2. 打开工作空间「工艺组」（/workspace/workspaces/工艺组）");
console.log("    3. 用户技能 ≈3 个（doc/system-health）；项目技能见各 workspace");
console.log("═".repeat(56));

if (restart) restartServices();
