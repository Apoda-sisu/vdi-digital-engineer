#!/usr/bin/env node
/** Phase 9b — manifest pick resolution tests */

import { buildMethanolFixture } from "./converter.mjs";
import { disciplineOutputToPlantModel } from "./plant-converter.mjs";
import { buildDrawingManifest, resolvePickFromManifest } from "./manifest-export.mjs";
import { getObjectByTag, formatPlantObject } from "./plant-object-lookup.mjs";

const fixture = buildMethanolFixture();
const model = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });

const manifest = buildDrawingManifest(model, {
  drawing_number: "PFD-100-001-PREVIEW",
  view_id: model.views?.find((v) => v.view_type === "pfd")?.view_id,
  sheet_size: "A1",
});

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

console.log("Phase 9b manifest pick tests\n");

assert(manifest.objects.length >= 12, `manifest has ${manifest.objects.length} objects (>=12)`);

const r101 = manifest.objects.find((o) => o.tag === "R-101");
assert(r101?.bbox_view, "R-101 has bbox_view");

if (r101?.bbox_view) {
  const cx = r101.bbox_view.x + r101.bbox_view.w / 2;
  const cy = r101.bbox_view.y + r101.bbox_view.h / 2;
  const pick = resolvePickFromManifest(manifest, cx, cy);
  assert(pick.status === "hit" && pick.tag === "R-101", "resolve_pick hits R-101 center");

  const obj = getObjectByTag(model, pick.object_id ? pick.tag : "R-101");
  const fmt = formatPlantObject(obj || getObjectByTag(model, "R-101"));
  assert(fmt.fields.some((f) => f.key === "design_P_MPaG" || f.key === "design_T_C"), "R-101 has design fields");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
