#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "run-skill-eval-compare.mjs");
const r = spawnSync(
  process.execPath,
  [
    script,
    "--skill", "vdi-water-circulating",
    "--sprint", "WA-M2e",
    "--iteration", "iteration-wa-m2e",
    "--title", "circulating",
    "--example-bleed-regex", "2000 m³|2200m³|800 m³",
  ],
  { stdio: "inherit" }
);
process.exit(r.status ?? 1);
