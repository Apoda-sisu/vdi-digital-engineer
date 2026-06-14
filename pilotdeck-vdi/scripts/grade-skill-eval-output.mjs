#!/usr/bin/env node
/**
 * 对 Skill eval 输出文本批量评分（断言驱动）
 * 用法:
 *   node pilotdeck-vdi/scripts/grade-skill-eval-output.mjs \
 *     --evals workspaces/给排水组/skills/vdi-water-drainage/evals/evals.json \
 *     --run-dir workspaces/给排水组/skill-workspaces/vdi-water-drainage/iteration-wa-m2a/eval-1/baseline_skill/outputs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  return {
    evals: get("--evals"),
    runDir: get("--run-dir"),
    outputFile: get("--out"),
    label: get("--label") || "run",
  };
}

function loadText(runDir) {
  const responsePath = path.join(runDir, "response.md");
  if (fs.existsSync(responsePath)) return fs.readFileSync(responsePath, "utf8");
  const files = fs.readdirSync(runDir).filter((f) => f.endsWith(".md") || f.endsWith(".txt"));
  if (files.length) return fs.readFileSync(path.join(runDir, files[0]), "utf8");
  return "";
}

function checkAssertion(text, a) {
  switch (a.type) {
    case "text_contains":
      return text.includes(a.value);
    case "text_not_contains":
      return !text.includes(a.value);
    case "text_contains_any":
      return (a.values || []).some((v) => text.includes(v));
    default:
      return true;
  }
}

function gradeEval(evalItem, text) {
  const assertions = evalItem.assertions || [];
  const results = assertions.map((a) => {
    const passed = checkAssertion(text, a);
    return {
      text: `${a.type}:${a.value || (a.values || []).join("|")}`,
      passed,
      optional: !!a.optional,
    };
  });
  const required = results.filter((r) => !r.optional);
  const passed = required.filter((r) => r.passed).length;
  const total = required.length;
  return {
    eval_id: evalItem.id,
    eval_name: evalItem.name,
    pass_rate: total ? passed / total : 1,
    passed,
    total,
    expectations: results,
  };
}

function main() {
  const { evals: evalsPath, runDir, outputFile, label } = parseArgs();
  if (!evalsPath || !runDir) {
    console.error("需要 --evals 和 --run-dir");
    process.exit(2);
  }
  const spec = JSON.parse(fs.readFileSync(evalsPath, "utf8"));
  const text = loadText(runDir);
  if (!text.trim()) {
    console.error(`无输出文本: ${runDir}`);
    process.exit(2);
  }

  const byEval = {};
  for (const ev of spec.evals) {
    const id = String(ev.id);
    const subdir = path.join(runDir, "..", "..", `eval-${id}`, label, "outputs");
    const actualDir = fs.existsSync(path.join(subdir, "response.md")) ? subdir : runDir;
    const t = actualDir === runDir ? text : loadText(actualDir);
    byEval[id] = gradeEval(ev, t || text);
  }

  // 单 run-dir 模式：评该目录对应的一个 eval（从路径推断 eval-N）
  const match = runDir.match(/eval-(\d+)/);
  const singleId = match?.[1];
  let grading;
  if (singleId && spec.evals.find((e) => String(e.id) === singleId)) {
    const ev = spec.evals.find((e) => String(e.id) === singleId);
    grading = gradeEval(ev, text);
  } else {
    grading = {
      label,
      evals: Object.values(byEval),
      pass_rate: Object.values(byEval).reduce((s, g) => s + g.pass_rate, 0) / spec.evals.length,
    };
  }

  const out = outputFile || path.join(runDir, "grading.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(grading, null, 2));

  const rate = grading.pass_rate ?? (grading.total ? grading.passed / grading.total : 0);
  console.log(JSON.stringify({ label: label || grading.eval_name, pass_rate: rate, path: out }));
}

main();
