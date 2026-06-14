#!/usr/bin/env node
/** @deprecated 请使用 run-skill-eval-compare.mjs */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "run-skill-eval-compare.mjs");
const r = spawnSync(
  process.execPath,
  [
    script,
    "--skill", "vdi-water-drainage",
    "--sprint", "WA-M2a",
    "--iteration", "iteration-wa-m2a",
    "--title", "drainage",
    "--example-bleed-regex", "280 m³|282 m³|DN300|Kh=2\\.6",
  ],
  { stdio: "inherit" }
);
process.exit(r.status ?? 1);
