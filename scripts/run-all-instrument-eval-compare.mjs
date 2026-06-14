#!/usr/bin/env node
/** 批量跑仪控 L2 eval benchmark（IN-M1） */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SLUGS = [
  "vdi-instrument-index",
  "vdi-instrument-loop",
  "vdi-instrument-interlock",
  "vdi-instrument-dcs",
  "vdi-instrument-cable",
  "vdi-instrument-valve",
  "vdi-instrument-analytical",
  "vdi-instrument-telecom",
];

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../pilotdeck-vdi/scripts/run-skill-eval-compare.mjs");
let fail = 0;
for (const skill of SLUGS) {
  const r = spawnSync(
    process.execPath,
    [script, "--skill", skill, "--sprint", "IN-M1", "--iteration", "iteration-in-m1"],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    console.error(`❌ ${skill}:\n${r.stderr || r.stdout}`);
    fail++;
  } else {
    const m = (r.stdout || "").match(/Δ pass_rate: ([\d.-]+)%/);
    console.log(`✅ ${skill} Δ=${m?.[1] ?? "?"}%`);
  }
}
process.exit(fail ? 1 : 0);
