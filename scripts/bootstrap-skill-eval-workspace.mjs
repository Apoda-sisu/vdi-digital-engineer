#!/usr/bin/env node
/**
 * 为 Skill 批量脚手架 eval workspace
 *
 * 用法:
 *   node scripts/bootstrap-skill-eval-workspace.mjs --skill vdi-piping-material-class
 *   node scripts/bootstrap-skill-eval-workspace.mjs --discipline PI --iteration iteration-pi-m3
 *   node scripts/bootstrap-skill-eval-workspace.mjs --all-piping-l2 --iteration iteration-pi-m3
 *   node scripts/bootstrap-skill-eval-workspace.mjs --all-instrument-l2 --iteration iteration-in-m1
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  REPO,
  skillDir,
  skillWorkspaceDir,
} from "../pilotdeck-vdi/config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PIPING_L2 = [
  "vdi-piping-material-class",
  "vdi-piping-line-list",
  "vdi-piping-layout",
  "vdi-piping-equipment-connect",
  "vdi-piping-rack-layout",
  "vdi-piping-routing",
  "vdi-piping-support",
  "vdi-piping-stress",
  "vdi-piping-insulation",
  "vdi-piping-isometric",
  "vdi-piping-valve-spec",
  "vdi-piping-underground",
  "vdi-piping-cad-3d",
];

const INSTRUMENT_L2 = [
  "vdi-instrument-index",
  "vdi-instrument-loop",
  "vdi-instrument-interlock",
  "vdi-instrument-dcs",
  "vdi-instrument-cable",
  "vdi-instrument-valve",
  "vdi-instrument-analytical",
  "vdi-instrument-telecom",
];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (f) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : null;
  };
  return {
    skill: get("--skill"),
    discipline: get("--discipline"),
    iteration: get("--iteration") || "iteration-default",
    allPiping: args.includes("--all-piping-l2"),
    allInstrument: args.includes("--all-instrument-l2"),
    dryRun: args.includes("--dry-run"),
  };
}

function tryGitSnapshot(skillPath, slug) {
  try {
    const rel = path.relative(REPO, skillPath).split(path.sep).join("/");
    const out = execSync(`git log --follow --diff-filter=M --format=%H -- "${rel}"`, {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    const commits = out.split("\n").filter(Boolean);
    if (commits.length < 2) return null;
    const old = execSync(`git show ${commits[commits.length - 1]}:"${rel}"`, {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    if (old && !old.includes("generation: v1.2")) return { content: old, reason: "git_history" };
  } catch {
    /* no git history */
  }
  return null;
}

function bootstrapOne(slug, iteration, dryRun) {
  const srcDir = skillDir(slug);
  const wsDir = skillWorkspaceDir(slug);
  if (!srcDir || !wsDir) {
    console.log(`⚠ 跳过 ${slug}: 无法解析路径`);
    return false;
  }

  const skillMd = path.join(srcDir, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    console.log(`⚠ 跳过 ${slug}: 无 SKILL.md`);
    return false;
  }

  const snapshotDir = path.join(wsDir, "skill-snapshot-v1.1-baseline");
  const snapshotMd = path.join(snapshotDir, "SKILL.md");
  const metaPath = path.join(snapshotDir, "meta.json");

  const evalsPath = path.join(srcDir, "evals/evals.json");
  let evalCount = 3;
  if (fs.existsSync(evalsPath)) {
    try {
      evalCount = JSON.parse(fs.readFileSync(evalsPath, "utf8")).evals?.length || 3;
    } catch {
      /* default 3 */
    }
  }

  const dirs = [];
  for (let i = 1; i <= evalCount; i++) {
    dirs.push(path.join(wsDir, iteration, `eval-${i}`, "baseline_skill", "outputs"));
    dirs.push(path.join(wsDir, iteration, `eval-${i}`, "with_skill", "outputs"));
  }

  if (dryRun) {
    console.log(`[dry-run] ${slug}: snapshot + ${evalCount} evals × 2`);
    return true;
  }

  fs.mkdirSync(snapshotDir, { recursive: true });
  if (!fs.existsSync(snapshotMd)) {
    const fromGit = tryGitSnapshot(skillMd, slug);
    if (fromGit) {
      fs.writeFileSync(snapshotMd, fromGit.content);
      fs.writeFileSync(
        metaPath,
        JSON.stringify({ snapshot_reason: fromGit.reason, lines: fromGit.content.split("\n").length, snapshot_at: new Date().toISOString() }, null, 2) + "\n"
      );
    } else {
      const current = fs.readFileSync(skillMd, "utf8");
      fs.writeFileSync(snapshotMd, current);
      fs.writeFileSync(
        metaPath,
        JSON.stringify({ snapshot_reason: "no_v1_1_history", lines: current.split("\n").length, snapshot_at: new Date().toISOString() }, null, 2) + "\n"
      );
    }
  }

  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
  console.log(`✅ ${slug}: workspace 脚手架 (${evalCount} evals)`);
  return true;
}

function slugsForDiscipline(code) {
  const dc = JSON.parse(fs.readFileSync(path.join(REPO, "pilotdeck-vdi/config/discipline-codes.json"), "utf8"));
  const m = dc.mappings?.[code];
  return m?.sub_skills || [];
}

function main() {
  const opts = parseArgs();
  let slugs = [];
  if (opts.allPiping) slugs = PIPING_L2;
  else if (opts.allInstrument) slugs = INSTRUMENT_L2;
  else if (opts.discipline) slugs = slugsForDiscipline(opts.discipline);
  else if (opts.skill) slugs = [opts.skill];
  else {
    console.error("需要 --skill、--discipline、--all-piping-l2 或 --all-instrument-l2");
    process.exit(2);
  }

  let ok = 0;
  for (const slug of slugs) {
    if (bootstrapOne(slug, opts.iteration, opts.dryRun)) ok++;
  }
  console.log(`\n完成: ${ok}/${slugs.length}`);
}

main();
