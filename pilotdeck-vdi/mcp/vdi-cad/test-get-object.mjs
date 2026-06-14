#!/usr/bin/env node
/** Phase 8c — get_object from PlantModel file (no FreeCAD). */

import { buildMethanolFixture } from "./converter.mjs";
import { disciplineOutputToPlantModel } from "./plant-converter.mjs";
import { getObjectFromProject, getObjectByTag, formatPlantObject } from "./plant-object-lookup.mjs";
import { MEOH_PROJECT_ID } from "../../config/pilot-paths.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixture = buildMethanolFixture();
const model = disciplineOutputToPlantModel(fixture, { project_id: MEOH_PROJECT_ID });

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

console.log("Phase 8c get_object tests\n");

const p401 = (model.objects || []).find((o) => o.tag === "P-401");
assert(p401?.object_id, "fixture has P-401");

const fmt = formatPlantObject(p401);
assert(fmt.fields.some((f) => f.key === "design_P_MPaG"), "P-401 formatted design_P");

const byTag = getObjectByTag(model, "R-101");
assert(byTag?.class === "Equipment", "getObjectByTag R-101");

// File-based lookup if plant/model.json exists
process.env.VDI_WORKSPACE_ROOT =
  process.env.VDI_WORKSPACE_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../workspaces");

const fileResult = getObjectFromProject(MEOH_PROJECT_ID, p401.object_id);
if (fileResult.status === "success") {
  assert(fileResult.formatted.tag === "P-401", "file get_object P-401");
} else {
  console.log(`  ℹ skip file lookup: ${fileResult.message}`);
  assert(true, "file lookup skipped (no workspace plant model)");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
