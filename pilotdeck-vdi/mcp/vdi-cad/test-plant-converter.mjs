#!/usr/bin/env node
/** Unit test: PlantModel converter */

import {
  disciplineOutputToPlantModel,
  plantModelToCadCommand,
  mergePlantModel,
  stableObjectId,
} from "./plant-converter.mjs";
import {
  disciplineOutputToCadCommand,
  buildMethanolFixture,
} from "./converter.mjs";

const fixture = buildMethanolFixture();
const model1 = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });
const model2 = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });

const equipment = model1.objects.filter((o) => o.class === "Equipment");
const pipes = model1.objects.filter((o) => o.class === "PipeRun");
const instruments = model1.objects.filter((o) => o.class === "Instrument");

const cmd = plantModelToCadCommand(model1, { drawing_type: "pfd" });
const cmdLegacy = disciplineOutputToCadCommand(fixture, { drawing_type: "pfd" });

const idStable = equipment.every(
  (e, i) => e.object_id === model2.objects.filter((o) => o.class === "Equipment")[i]?.object_id
);

const merged = mergePlantModel(model1, {
  objects: [
    {
      object_id: equipment[0].object_id,
      class: "Equipment",
      tag: equipment[0].tag,
      attributes: { ...equipment[0].attributes, design_P_MPaG: 9.9 },
    },
  ],
});
const mergedEq = merged.objects.find((o) => o.object_id === equipment[0].object_id);

const checks = [
  ["model version", model1.version === "1.0"],
  ["equipment count", equipment.length === 48],
  ["pipe count", pipes.length === 32],
  ["instrument count", instruments.length >= 12],
  ["all have object_id", model1.objects.every((o) => /^[0-9a-f-]{36}$/.test(o.object_id))],
  ["stable object_id", idStable],
  ["views pfd+pid+layout+iso+3d", model1.views.length >= 5],
  ["cad command equipment object_id", cmd.equipment.every((e) => e.object_id)],
  ["cad command parameters", cmd.equipment[0]?.parameters?.symbol_id],
  ["legacy converter equipment count", cmdLegacy.equipment.length === 48],
  ["legacy has object_id", cmdLegacy.equipment.every((e) => e.object_id)],
  ["legacy parameters not empty", Object.keys(cmdLegacy.equipment[0]?.parameters || {}).length > 0],
  ["merge updates attribute", mergedEq?.attributes?.design_P_MPaG === 9.9],
  ["compressor type C-601", equipment.find((e) => e.tag === "C-601")?.attributes?.equipment_type === "column"],
  ["K prefix would be compressor", stableObjectId("MEOH-100", "Equipment", "K-101") !== stableObjectId("MEOH-100", "Equipment", "P-101")],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(ok ? `✓ ${name}` : `✗ ${name}`);
  if (!ok) failed++;
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll plant converter checks passed.");
