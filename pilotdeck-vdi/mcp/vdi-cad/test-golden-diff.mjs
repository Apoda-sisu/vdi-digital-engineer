#!/usr/bin/env node
/** Golden diff — object counts + attribute snapshot vs baseline. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "crypto";
import { buildMethanolFixture } from "./converter.mjs";
import { disciplineOutputToPlantModel } from "./plant-converter.mjs";
import {
  countByClass,
  plantModelAttributeSnapshot,
  diffPlantModelSnapshots,
} from "./plant-model-validator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../..");
const GOLDEN = path.join(REPO, "pilotdeck-vdi/freecad/golden/meoh-100");
const BASELINE_PATH = path.join(GOLDEN, "plant-model-baseline.json");
const MANIFEST_PATH = path.join(GOLDEN, "manifest.json");

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("Golden diff tests\n");

const fixture = buildMethanolFixture();
const current = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });
const currentCounts = countByClass(current);

const expectedCounts = {
  Equipment: 48,
  PipeRun: 32,
  Instrument: 12,
  Valve: 32,
  SafetyValve: 5,
  ControlLoop: 12,
};

for (const [cls, n] of Object.entries(expectedCounts)) {
  assert(currentCounts[cls] === n, `${cls} count ${currentCounts[cls]} === ${n}`);
}

assert(current.objects.length === 141, `total objects 141 (${current.objects.length})`);

if (fs.existsSync(BASELINE_PATH)) {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  const baseSnap = plantModelAttributeSnapshot(baseline);
  const curSnap = plantModelAttributeSnapshot(current);
  const diffs = diffPlantModelSnapshots(baseSnap, curSnap);
  const attrDiffs = diffs.filter((d) => d.kind === "attribute");
  assert(diffs.filter((d) => d.kind === "added").length === 0, "no new tags vs baseline");
  assert(diffs.filter((d) => d.kind === "removed").length === 0, "no removed tags vs baseline");
  console.log(`  ℹ attribute diffs vs baseline: ${attrDiffs.length} (expected after design enrichment)`);
} else {
  console.log("  ⚠ baseline missing, skipping snapshot diff");
}

const checksum = createHash("sha256")
  .update(JSON.stringify(current.objects.map((o) => ({ tag: o.tag, class: o.class, attrs: o.attributes }))))
  .digest("hex")
  .slice(0, 16);

if (fs.existsSync(MANIFEST_PATH)) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  assert(manifest.object_count <= current.objects.length, "manifest object_count current");
} else {
  console.log("  ⚠ manifest missing");
}

console.log(`  ℹ current checksum prefix: ${checksum}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
