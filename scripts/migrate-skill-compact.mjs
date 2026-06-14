#!/usr/bin/env node
/**
 * Skill 压缩迁移门禁检查（不自动改正文）
 * 用法:
 *   node scripts/migrate-skill-compact.mjs --skill vdi-water-supply --code wa-d01
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillDir, skillWorkspaceDir, REPO } from "../pilotdeck-vdi/config/skills-layout.mjs";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (f) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : null;
  };
  return {
    skill: get("--skill"),
    code: get("--code"),
    checkOnly: args.includes("--check-only"),
    snapshot: !args.includes("--no-snapshot"),
  };
}

function checklist(skill, code) {
  const dir = skillDir(skill);
  const skillMd = dir ? path.join(dir, "SKILL.md") : "";
  const issues = [];
  const ok = [];

  if (!dir || !fs.existsSync(skillMd)) {
    console.error(`❌ 缺少 ${skillMd || skill}`);
    process.exit(1);
  }

  const text = fs.readFileSync(skillMd, "utf8");
  const lines = text.split("\n").length;
  const body = text.replace(/^---[\s\S]*?---\n?/, "");

  const refs = {
    cpTemplates: path.join(dir, `references/${code}-cp-templates.md`),
    taskCard: path.join(dir, `references/${code}-task-card.md`),
    evals: path.join(dir, "evals/evals.json"),
  };

  if (text.includes("generation: v1.2") || text.includes('generation: "v1.2"')) ok.push("generation v1.2");
  else issues.push("缺少 metadata.vdi.generation: v1.2");

  if (/references\/.*cp-templates/.test(text)) ok.push("CP 模板加载指令");
  else issues.push("正文缺少 references/*-cp-templates 指针");

  if (text.includes("CP-0") && text.includes("⛔ [CP-")) ok.push("CP 交互模式");
  else issues.push("缺少 CP-0 或停止标记");

  if (fs.existsSync(refs.cpTemplates)) ok.push(`附录 ${code}-cp-templates.md`);
  else issues.push(`缺少 ${refs.cpTemplates}`);

  if (fs.existsSync(refs.taskCard)) ok.push(`附录 ${code}-task-card.md`);
  else issues.push(`缺少 ${refs.taskCard}（建议）`);

  if (fs.existsSync(refs.evals)) {
    const ev = JSON.parse(fs.readFileSync(refs.evals, "utf8"));
    if ((ev.evals?.length || 0) >= 2) ok.push(`evals.json (${ev.evals.length} 条)`);
    else issues.push("evals.json 不足 2 条");
  } else {
    issues.push("缺少 evals/evals.json");
  }

  const level = (text.match(/level:\s*(\d)/) || [])[1];
  if (level === "2" && lines > 200) {
    issues.push(`L2 行数 ${lines} > 200（建议拆 references，质量优先可豁免）`);
  } else if (level === "1" && lines > 150) {
    issues.push(`L1 行数 ${lines} > 150`);
  }

  if (/320 m³|354\.4 m³/.test(body.split("输出契约")[0] || body.slice(0, 2000))) {
    issues.push("正文叙事段含示例数值（应仅在附录或契约 JSON 样例）");
  }

  return { lines, level, ok, issues, refs, dir, skillMd };
}

function snapshotBaseline(skill) {
  const src = skillDir(skill);
  if (!src) return;
  const ws = path.join(skillWorkspaceDir(skill), "skill-snapshot-v1.1-baseline");
  fs.mkdirSync(ws, { recursive: true });
  const dest = path.join(ws, "SKILL.md");
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(path.join(src, "SKILL.md"), dest);
    console.log(`📦 已备份基线 → ${dest}`);
  } else {
    console.log(`📦 基线已存在 → ${dest}`);
  }
}

const { skill, code, checkOnly, snapshot } = parseArgs();
if (!skill || !code) {
  console.error("用法: node scripts/migrate-skill-compact.mjs --skill vdi-water-supply --code wa-d01");
  process.exit(2);
}

if (snapshot && !checkOnly) snapshotBaseline(skill);

const r = checklist(skill, code);

console.log("═".repeat(50));
console.log(`  migrate-skill-compact: ${skill}`);
console.log("═".repeat(50));
console.log(`行数: ${r.lines} · level: ${r.level || "?"}`);
console.log(`\n✅ ${r.ok.length} 项通过`);
r.ok.forEach((x) => console.log(`   · ${x}`));
if (r.issues.length) {
  console.log(`\n⚠ ${r.issues.length} 项待办`);
  r.issues.forEach((x) => console.log(`   · ${x}`));
} else {
  console.log("\n🎉 迁移门禁全部通过");
}

const reportPath = path.join(skillWorkspaceDir(skill) || REPO, "migrate-checklist.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(
  reportPath,
  JSON.stringify({ skill, code, lines: r.lines, ok: r.ok, issues: r.issues, at: new Date().toISOString() }, null, 2)
);
console.log(`\n报告: ${reportPath}`);
process.exit(r.issues.length > 0 ? 1 : 0);
