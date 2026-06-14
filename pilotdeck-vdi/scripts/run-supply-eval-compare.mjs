#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "run-skill-eval-compare.mjs");
const r = spawnSync(
  process.execPath,
  [
    script,
    "--skill", "vdi-water-supply",
    "--sprint", "WA-M2b",
    "--iteration", "iteration-wa-m2b",
    "--title", "supply",
    "--example-bleed-regex", "320 m³|354\\.4|DN200.*1\\.48",
  ],
  { stdio: "inherit" }
);
process.exit(r.status ?? 1);
