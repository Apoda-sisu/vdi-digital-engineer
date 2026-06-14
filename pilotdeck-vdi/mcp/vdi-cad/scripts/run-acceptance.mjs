#!/usr/bin/env node
/**
 * Phase 7 acceptance runner — offline gate + optional FreeCAD E2E.
 *
 * Usage:
 *   node scripts/run-acceptance.mjs           # offline only (PR gate)
 *   node scripts/run-acceptance.mjs --e2e   # + FreeCAD E2E (needs RPC)
 *   node scripts/run-acceptance.mjs --full  # all npm test:* scripts
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const withE2e = process.argv.includes("--e2e");
const full = process.argv.includes("--full");

function run(label, cmd, args = []) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: false });
  if (r.status !== 0) {
    console.error(`\n✗ ${label} failed (exit ${r.status})`);
    process.exit(r.status || 1);
  }
  console.log(`✓ ${label}`);
}

console.log("=== VDI-CAD Phase 7–10 Acceptance ===\n");

if (full) {
  const scripts = [
    "test:converter",
    "test:plant",
    "test:layout",
    "test:pid",
    "test:publish",
    "test:golden",
    "test:multi-view",
    "test:dexpi",
    "test:dexpi:roundtrip",
    "test:get-object",
    "test:manifest-pick",
    "test:e2e:mock",
  ];
  for (const s of scripts) run(`npm run ${s}`, "npm", ["run", s]);
}

run("acceptance gate (§9.2 offline)", "node", ["test-acceptance-gate.mjs"]);

if (process.argv.includes("--handover")) {
  run("M6 digital handover pack", "node", ["digital-handover-pack.mjs", "--project", "MEOH-100"]);
}

if (withE2e) {
  run("FreeCAD E2E", "node", ["test-e2e.mjs"]);
} else {
  console.log("\nℹ  Skip FreeCAD E2E (pass --e2e to include)");
  console.log("   bash pilotdeck-vdi/freecad/verify-rpc.sh");
}

console.log("\n=== Phase 7 acceptance PASSED ===\n");
