#!/usr/bin/env node
/** 批量跑管道 L2 eval benchmark */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SLUGS = [
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

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../pilotdeck-vdi/scripts/run-skill-eval-compare.mjs");
let fail = 0;
for (const skill of SLUGS) {
  const r = spawnSync(
    process.execPath,
    [script, "--skill", skill, "--sprint", "PI-M3", "--iteration", "iteration-pi-m3"],
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
