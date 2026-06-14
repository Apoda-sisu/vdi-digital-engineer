#!/usr/bin/env node
/** Phase 4 — PlantModel publish gate + object list export */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { disciplineOutputToPlantModel, plantModelToCadCommand } from "./plant-converter.mjs";
import { buildMethanolFixture } from "./converter.mjs";
import { validatePlantModelForPublish } from "./plant-model-validator.mjs";
import { plantModelToObjectListCsv, equipmentDesignSummary } from "./plant-object-export.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

console.log("Phase 4 publish & export tests\n");

const fixture = buildMethanolFixture();
const model = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });
const validation = validatePlantModelForPublish(model, { min_equipment: 48 });

assert(validation.publishable, "MEOH PlantModel publishable");
assert(validation.valid, "validation.valid true");
assert(validation.counts_by_class.Equipment === 48, "48 equipment in gate");
assert(validation.error_count === 0, "no validation errors");

const summary = equipmentDesignSummary(model);
assert(summary.total === 48, "equipment summary total 48");
assert(summary.with_design_P === 48, `all equipment have design_P (${summary.with_design_P})`);
assert(summary.complete, "equipment design conditions complete");

const csv = plantModelToObjectListCsv(model);
assert(csv.includes("object_id,class,tag"), "CSV header");
assert(csv.split("\n").length > 141, `CSV rows >=141 (${csv.split("\n").length})`);

const cmd = plantModelToCadCommand(model, { drawing_type: "pid" });
assert(cmd.options.create_sheet === true, "create_sheet default true");
assert(cmd.options.export_object_list === true, "export_object_list default true");
assert(cmd.output.formats.includes("PDF"), "default formats include PDF");

const broken = structuredClone(model);
const eq0 = broken.objects.find((o) => o.class === "Equipment");
eq0.attributes.design_P_MPaG = null;
const bad = validatePlantModelForPublish(broken, { min_equipment: 48 });
assert(!bad.publishable, "missing design_P blocks publish");
assert(bad.issues.some((i) => i.field.includes("design_P_MPaG")), "reports design_P issue");

const tmpCsv = path.join(__dirname, ".tmp-object-list.csv");
fs.writeFileSync(tmpCsv, csv);
assert(fs.existsSync(tmpCsv), "CSV writeable");
fs.unlinkSync(tmpCsv);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
