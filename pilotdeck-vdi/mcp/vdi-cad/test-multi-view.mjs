#!/usr/bin/env node
/** Phase 5 — multi-view PlantModel (layout / isometric / 3d). */

import {
  disciplineOutputToPlantModel,
  plantModelToCadCommand,
  resolveViewId,
} from "./plant-converter.mjs";
import { buildMethanolFixture } from "./converter.mjs";

const fixture = buildMethanolFixture();
const model = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });

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

console.log("Phase 5 multi-view tests\n");

const viewTypes = model.views.map((v) => v.view_type);
assert(model.views.length >= 5, `5 views in PlantModel (${model.views.length})`);
assert(viewTypes.includes("layout"), "layout view exists");
assert(viewTypes.includes("isometric"), "isometric view exists");
assert(viewTypes.includes("3d"), "3d view exists");

const equipment = model.objects.filter((o) => o.class === "Equipment");
const withFootprint = equipment.filter((o) => o.attributes?.footprint_x != null);
assert(withFootprint.length === 48, `equipment footprint (${withFootprint.length})`);

for (const dt of ["layout", "isometric", "3d"]) {
  const cmd = plantModelToCadCommand(model, { drawing_type: dt, project_id: "MEOH-100" });
  assert(cmd.drawing_type === dt, `CadCommand drawing_type=${dt}`);
  assert(cmd.view_id === resolveViewId("MEOH-100", dt), `${dt} view_id resolved`);
  assert(cmd.equipment.length === 48, `${dt} has 48 equipment`);
  assert(cmd.equipment[0]?.parameters?.footprint_x != null, `${dt} equipment has footprint`);
  assert(cmd.equipment[0]?.position?.z != null, `${dt} equipment has z/elevation`);
  assert(cmd.lines.length === 32, `${dt} has 32 lines`);
}

const layoutCmd = plantModelToCadCommand(model, { drawing_type: "layout" });
assert(layoutCmd.tables?.equipment_list?.length === 48, "layout equipment table");

const isoCmd = plantModelToCadCommand(model, { drawing_type: "isometric" });
assert((isoCmd.tables?.iso_pipe_list?.length || 0) === 32, "isometric pipe table 32 rows");

const cmd3d = plantModelToCadCommand(model, { drawing_type: "3d" });
assert(cmd3d.output.formats.includes("STEP"), "3d default formats include STEP");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
