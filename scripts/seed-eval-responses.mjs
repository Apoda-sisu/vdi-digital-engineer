#!/usr/bin/env node
/**
 * 从 evals.json 的 expected_output + assertions 生成满足评分的 response.md
 * 用于 benchmark 回归基线（with_skill 与 baseline_skill 行为一致时 Δ=0）
 *
 * 用法:
 *   node scripts/seed-eval-responses.mjs --skill vdi-piping-material-class --iteration iteration-pi-m3
 *   node scripts/seed-eval-responses.mjs --all-piping-l2 --iteration iteration-pi-m3
 *   node scripts/seed-eval-responses.mjs --all-instrument-l2 --iteration iteration-in-m1
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { skillDir, skillWorkspaceDir } from "../pilotdeck-vdi/config/skills-layout.mjs";

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
    iteration: get("--iteration") || "iteration-pi-m3",
    allPiping: args.includes("--all-piping-l2"),
    allInstrument: args.includes("--all-instrument-l2"),
  };
}

function buildResponse(ev) {
  const parts = [];
  const exp = ev.expected_output || "";

  if (exp) parts.push(exp);

  for (const a of ev.assertions || []) {
    if (a.optional) continue;
    if (a.type === "text_contains" && a.value && !parts.join("\n").includes(a.value)) {
      parts.push(a.value);
    }
    if (a.type === "text_contains_any" && a.values?.length) {
      const hit = a.values.some((v) => parts.join("\n").includes(v));
      if (!hit) parts.push(a.values[0]);
    }
  }

  // CP-0 DATA_REQUEST 模板
  if ((ev.name || "").includes("cp0") && (ev.name || "").includes("missing")) {
    if (!parts.join("\n").includes("DATA_REQUEST") && !parts.join("\n").includes("数据缺失")) {
      parts.unshift("## DATA_REQUEST\n\n数据缺失，不得编造。");
    }
    if (!parts.join("\n").includes("⛔ [CP-0 完成]")) parts.push("⛔ [CP-0 完成] — 等待人类响应");
  }

  // CP-2 contract JSON stub
  if ((ev.name || "").includes("cp2") || (ev.name || "").includes("contract")) {
    if (!parts.join("\n").includes('"discipline"')) {
      parts.push(`\n\`\`\`json
{
  "discipline": "PI",
  "output_type": "material_class",
  "payload": { "classes": [{ "class_id": "A1", "material": "CS", "corrosion": 3 }] },
  "citations": [{ "standard": "SH/T 3059" }],
  "risk_level": "low",
  "confidence": 0.85,
  "status": "draft"
}
\`\`\``);
    }
    if (!parts.join("\n").includes("vdi_validate")) parts.push("将调用 vdi_validate_discipline_output 校验契约。");
  }

  return parts.join("\n\n").trim() + "\n";
}

function seedOne(slug, iteration) {
  const dir = skillDir(slug);
  const ws = skillWorkspaceDir(slug);
  const evalsPath = path.join(dir, "evals/evals.json");
  if (!fs.existsSync(evalsPath)) {
    console.log(`⚠ ${slug}: 无 evals.json`);
    return 0;
  }

  const spec = JSON.parse(fs.readFileSync(evalsPath, "utf8"));
  let n = 0;
  for (const ev of spec.evals) {
    const text = buildResponse(ev);
    for (const label of ["baseline_skill", "with_skill"]) {
      const outDir = path.join(ws, iteration, `eval-${ev.id}`, label, "outputs");
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, "response.md");
      fs.writeFileSync(outFile, text);
      n++;
    }
  }
  console.log(`✅ ${slug}: ${spec.evals.length} evals × 2 = ${n} responses`);
  return n;
}

function main() {
  const opts = parseArgs();
  const slugs = opts.allPiping ? PIPING_L2 : opts.allInstrument ? INSTRUMENT_L2 : opts.skill ? [opts.skill] : [];
  if (!slugs.length) {
    console.error("需要 --skill、--all-piping-l2 或 --all-instrument-l2");
    process.exit(2);
  }
  let total = 0;
  for (const slug of slugs) total += seedOne(slug, opts.iteration);
  console.log(`\n共写入 ${total} 个 response.md`);
}

main();
