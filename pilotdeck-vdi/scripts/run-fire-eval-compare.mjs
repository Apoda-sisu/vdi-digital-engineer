#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "run-skill-eval-compare.mjs");
const r = spawnSync(
  process.execPath,
  [
    script,
    "--skill", "vdi-water-fire",
    "--sprint", "WA-M2c",
    "--iteration", "iteration-wa-m2c",
    "--title", "fire",
    "--example-bleed-regex", "25000 m³|1026 m³|45 L/s.*20 L/s",
  ],
  { stdio: "inherit" }
);
process.exit(r.status ?? 1);
