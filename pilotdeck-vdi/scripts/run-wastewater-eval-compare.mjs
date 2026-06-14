#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "run-skill-eval-compare.mjs");
const r = spawnSync(
  process.execPath,
  [
    script,
    "--skill", "vdi-water-wastewater",
    "--sprint", "WA-M2d",
    "--iteration", "iteration-wa-m2d",
    "--title", "wastewater",
    "--example-bleed-regex", "500 m³|COD 800|B/C = 0\\.44|φ6m|350 万",
  ],
  { stdio: "inherit" }
);
process.exit(r.status ?? 1);
