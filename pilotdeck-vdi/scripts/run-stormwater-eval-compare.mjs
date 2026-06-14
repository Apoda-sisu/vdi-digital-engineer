#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "run-skill-eval-compare.mjs");
const r = spawnSync(
  process.execPath,
  [
    script,
    "--skill", "vdi-water-stormwater",
    "--sprint", "WA-M2f",
    "--iteration", "iteration-wa-m2f",
    "--title", "stormwater",
    "--example-bleed-regex", "281 L/s|240 × 2\\.0|DN500.*0\\.002",
  ],
  { stdio: "inherit" }
);
process.exit(r.status ?? 1);
