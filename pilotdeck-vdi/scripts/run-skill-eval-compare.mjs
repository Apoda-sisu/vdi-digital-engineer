#!/usr/bin/env node
/**
 * 通用 Skill eval 压缩前后对比聚合
 *
 * 用法:
 *   node pilotdeck-vdi/scripts/run-skill-eval-compare.mjs \
 *     --skill vdi-piping-material-class \
 *     --sprint PI-M3 \
 *     --iteration iteration-pi-m3
 *
 * 可选:
 *   --with-label with_skill_v1_2   # 新版侧报告标签（默认 with_skill_v1_2）
 *   --baseline-label baseline_skill
 *   --example-bleed-regex "pattern"  # 示例值污染检测（可多次传入）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { skillDir, skillWorkspaceDir, REPO } from "../config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const bleedRegex = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--example-bleed-regex" && args[i + 1]) bleedRegex.push(args[i + 1]);
  }
  return {
    skill: get("--skill"),
    sprint: get("--sprint") || "eval",
    iteration: get("--iteration") || "iteration-default",
    withLabel: get("--with-label") || "with_skill",
    baselineLabel: get("--baseline-label") || "baseline_skill",
    withReportKey: get("--with-report-key") || "with_skill_v1_2",
    bleedRegex,
    title: get("--title"),
  };
}

function skillMetrics(skillPath, bleedPatterns) {
  const text = fs.readFileSync(skillPath, "utf8");
  const lines = text.split("\n").length;
  const body = text.replace(/^---[\s\S]*?---\n?/, "");
  const bleed = bleedPatterns.length
    ? bleedPatterns.some((p) => new RegExp(p).test(body))
    : false;
  return {
    lines,
    has_cp0: text.includes("CP-0"),
    has_stop: text.includes("⛔ [CP-"),
    has_ref_templates: /references\/.*cp-templates/.test(text),
    has_example_bleed_risk: bleed,
    cp_stop_markers_in_body: (body.match(/⛔ \[CP-\d/g) || []).length,
  };
}

function gradeRun(ws, evalId, label, evalsPath, grader) {
  const runDir = path.join(ws, `eval-${evalId}`, label, "outputs");
  if (!fs.existsSync(path.join(runDir, "response.md"))) {
    throw new Error(`缺少输出: ${runDir}/response.md`);
  }
  const out = path.join(runDir, "grading.json");
  execSync(
    `node "${grader}" --evals "${evalsPath}" --run-dir "${runDir}" --out "${out}" --label "${label}"`,
    { stdio: "pipe" }
  );
  return JSON.parse(fs.readFileSync(out, "utf8"));
}

function main() {
  const opts = parseArgs();
  if (!opts.skill) {
    console.error("需要 --skill <slug>");
    process.exit(2);
  }

  const dir = skillDir(opts.skill);
  const wsDir = skillWorkspaceDir(opts.skill);
  if (!dir || !wsDir) {
    console.error(`无法解析路径: ${opts.skill}`);
    process.exit(2);
  }

  const WS = path.join(wsDir, opts.iteration);
  const EVALS = path.join(dir, "evals/evals.json");
  const GRADER = path.join(REPO, "pilotdeck-vdi/scripts/grade-skill-eval-output.mjs");
  const BASELINE_SKILL = path.join(wsDir, "skill-snapshot-v1.1-baseline/SKILL.md");
  const NEW_SKILL = path.join(dir, "SKILL.md");

  if (!fs.existsSync(EVALS)) {
    console.error(`缺少 evals: ${EVALS}`);
    process.exit(2);
  }
  if (!fs.existsSync(BASELINE_SKILL)) {
    console.error(`缺少基线快照: ${BASELINE_SKILL}`);
    process.exit(2);
  }

  const spec = JSON.parse(fs.readFileSync(EVALS, "utf8"));
  const baselineMetrics = skillMetrics(BASELINE_SKILL, opts.bleedRegex);
  const newMetrics = skillMetrics(NEW_SKILL, opts.bleedRegex);

  const baselineGrades = [];
  const newGrades = [];

  for (const ev of spec.evals) {
    baselineGrades.push(gradeRun(WS, ev.id, opts.baselineLabel, EVALS, GRADER));
    newGrades.push(gradeRun(WS, ev.id, opts.withLabel, EVALS, GRADER));
  }

  const avg = (arr) =>
    arr.reduce((s, g) => s + (g.pass_rate ?? (g.total ? g.passed / g.total : 1)), 0) / arr.length;

  const report = {
    generated_at: new Date().toISOString(),
    sprint: opts.sprint,
    skill: opts.skill,
    iteration: opts.iteration,
    skill_metrics: {
      baseline_v1_1: baselineMetrics,
      compressed_v1_2: newMetrics,
      line_reduction_pct: baselineMetrics.lines
        ? Math.round((1 - newMetrics.lines / baselineMetrics.lines) * 100)
        : 0,
    },
    benchmark: {
      baseline_skill: {
        mean_pass_rate: avg(baselineGrades),
        per_eval: baselineGrades.map((g) => ({
          id: g.eval_id,
          name: g.eval_name,
          pass_rate: g.pass_rate,
          passed: g.passed,
          total: g.total,
        })),
      },
      [opts.withReportKey]: {
        mean_pass_rate: avg(newGrades),
        per_eval: newGrades.map((g) => ({
          id: g.eval_id,
          name: g.eval_name,
          pass_rate: g.pass_rate,
          passed: g.passed,
          total: g.total,
        })),
      },
      delta_pass_rate: avg(newGrades) - avg(baselineGrades),
    },
  };

  const reportPath = path.join(WS, "benchmark.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const displayName = opts.title || opts.skill;
  console.log("═".repeat(60));
  console.log(`  ${opts.sprint} ${displayName} eval 对比`);
  console.log("═".repeat(60));
  console.log(`行数: ${baselineMetrics.lines} → ${newMetrics.lines} (-${report.skill_metrics.line_reduction_pct}%)`);
  console.log(`CP 模板 references: 基线 ${baselineMetrics.has_ref_templates} → 新版 ${newMetrics.has_ref_templates}`);
  if (opts.bleedRegex.length) {
    console.log(`正文示例值污染风险: 基线 ${baselineMetrics.has_example_bleed_risk} → 新版 ${newMetrics.has_example_bleed_risk}`);
  }
  console.log(`基线 pass_rate: ${(report.benchmark.baseline_skill.mean_pass_rate * 100).toFixed(1)}%`);
  console.log(`V1.2 pass_rate: ${(report.benchmark[opts.withReportKey].mean_pass_rate * 100).toFixed(1)}%`);
  console.log(`Δ pass_rate: ${(report.benchmark.delta_pass_rate * 100).toFixed(1)}%`);
  console.log(`\n报告: ${reportPath}`);
}

main();
