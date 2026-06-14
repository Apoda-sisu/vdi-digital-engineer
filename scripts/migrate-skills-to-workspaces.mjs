#!/usr/bin/env node
/**
 * 一次性迁移：根目录 skills/ + vdi-*-workspace/ → workspaces/{专业组}/
 * 用法: node scripts/migrate-skills-to-workspaces.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REPO,
  WORKSPACES,
  groupForSlug,
  skillsRootForGroup,
  skillWorkspaceDir,
} from "../pilotdeck-vdi/config/skills-layout.mjs";

const DRY = process.argv.includes("--dry-run");
const OLD_SKILLS = path.join(REPO, "skills");

function mv(src, dest) {
  if (!fs.existsSync(src)) return false;
  if (DRY) {
    console.log(`[dry] ${path.relative(REPO, src)} → ${path.relative(REPO, dest)}`);
    return true;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(src, dest);
  console.log(`✅ ${path.relative(REPO, src)} → ${path.relative(REPO, dest)}`);
  return true;
}

function cpMerge(src, dest) {
  if (!fs.existsSync(src)) return;
  if (DRY) {
    console.log(`[dry] merge ${path.relative(REPO, src)} → ${path.relative(REPO, dest)}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) {
      if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
      fs.renameSync(s, d);
    } else {
      fs.copyFileSync(s, d);
      fs.unlinkSync(s);
    }
  }
}

console.log("═".repeat(56));
console.log("  Skill 迁入 workspaces（按专业组）");
console.log("═".repeat(56));

if (!fs.existsSync(OLD_SKILLS)) {
  console.log("⚠ 根目录 skills/ 不存在，跳过实体迁移");
} else {
  const entries = fs.readdirSync(OLD_SKILLS, { withFileTypes: true });
  for (const e of entries) {
    const src = path.join(OLD_SKILLS, e.name);
    if (e.name === "index.json" || e.name === "freecad-test.json") continue;
    if (!e.isDirectory()) {
      const group = "工艺组";
      mv(src, path.join(skillsRootForGroup(group), e.name));
      continue;
    }
    const group = groupForSlug(e.name);
    if (!group) {
      console.warn(`⚠ 未映射专业组，跳过: ${e.name}`);
      continue;
    }
    const dest = path.join(skillsRootForGroup(group), e.name);
    mv(src, dest);
  }
  // 散落文件
  for (const f of ["index.json", "freecad-test.json"]) {
    const src = path.join(OLD_SKILLS, f);
    if (fs.existsSync(src)) {
      const destName = f === "index.json" ? path.join(WORKSPACES, "skills-registry.json") : f;
      const dest = f === "index.json" ? destName : path.join(skillsRootForGroup("工艺组"), f);
      mv(src, dest);
    }
  }
  if (!DRY && fs.existsSync(OLD_SKILLS)) {
    const left = fs.readdirSync(OLD_SKILLS);
    if (left.length === 0) fs.rmdirSync(OLD_SKILLS);
    else console.warn(`⚠ skills/ 残留: ${left.join(", ")}`);
  }
}

// INDEX.md 从 vdi-{x} 索引目录已随目录迁入；重命名为 INDEX.md
for (const [slug, group] of [
  ["vdi-water", "给排水组"],
  ["vdi-piping", "管道组"],
  ["vdi-process", "工艺组"],
]) {
  const idxNested = path.join(skillsRootForGroup(group), slug, "INDEX.md");
  const idxFlat = path.join(skillsRootForGroup(group), "INDEX.md");
  if (fs.existsSync(idxNested) && !fs.existsSync(idxFlat)) {
    mv(idxNested, idxFlat);
    if (!DRY) {
      const empty = path.join(skillsRootForGroup(group), slug);
      if (fs.existsSync(empty) && fs.readdirSync(empty).length === 0) fs.rmdirSync(empty);
    }
  }
}

// 根目录 vdi-*-workspace → workspaces/{group}/skill-workspaces/{slug}
for (const name of fs.readdirSync(REPO)) {
  if (!name.endsWith("-workspace") || !name.startsWith("vdi-")) continue;
  const slug = name.replace(/-workspace$/, "");
  const group = groupForSlug(slug);
  if (!group) {
    console.warn(`⚠ workspace 未映射: ${name}`);
    continue;
  }
  const src = path.join(REPO, name);
  const dest = skillWorkspaceDir(slug);
  mv(src, dest);
}

// 清理工作空间根目录散落的旧 Skill 副本（无 references 的过时目录）
const GROUPS = ["给排水组", "管道组", "工艺组", "管理组", "程序检测"];
for (const group of GROUPS) {
  const ws = path.join(WORKSPACES, group);
  if (!fs.existsSync(ws)) continue;
  const canonical = skillsRootForGroup(group);
  for (const e of fs.readdirSync(ws, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".") || e.name === "skills" || e.name === "skill-workspaces" || e.name === "pilot") continue;
    if (!e.name.startsWith("vdi-")) continue;
    const stray = path.join(ws, e.name);
    const canon = path.join(canonical, e.name);
    if (fs.existsSync(canon)) {
      if (DRY) console.log(`[dry] 删除散落副本 ${path.relative(REPO, stray)}`);
      else {
        fs.rmSync(stray, { recursive: true, force: true });
        console.log(`🗑 删除散落副本 ${path.relative(REPO, stray)}`);
      }
    }
  }
}

if (!DRY && fs.existsSync(OLD_SKILLS)) {
  try {
    fs.rmSync(OLD_SKILLS, { recursive: true, force: true });
    console.log("🗑 已删除根目录 skills/");
  } catch {
    /* */
  }
}

console.log("\n完成。请运行: node pilotdeck-vdi/scripts/generate-skill-index.mjs");
