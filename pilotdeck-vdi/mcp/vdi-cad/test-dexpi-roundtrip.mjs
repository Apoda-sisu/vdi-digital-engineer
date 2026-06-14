#!/usr/bin/env node
/** Phase 10b — DEXPI export/import round-trip POC */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMethanolFixture } from "./converter.mjs";
import { disciplineOutputToPlantModel } from "./plant-converter.mjs";
import { plantModelToDexpiXml, dexpiExportSummary } from "./dexpi-export.mjs";
import { dexpiXmlToPlantModelDraft, dexpiImportSummary } from "./dexpi-import.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.resolve(__dirname, "../../freecad/golden/meoh-100");

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

console.log("Phase 10b DEXPI round-trip tests\n");

const xml = plantModelToDexpiXml(model, { discipline: "PID" });
const exportSummary = dexpiExportSummary(model);
const draft = dexpiXmlToPlantModelDraft(xml);
const importSummary = dexpiImportSummary(draft);

assert(exportSummary.equipment === importSummary.equipment, `equipment count ${exportSummary.equipment}`);
assert(exportSummary.pipe_segments === importSummary.pipe_runs, `pipe count ${exportSummary.pipe_segments}`);
assert(exportSummary.instruments === importSummary.instruments, `instrument count ${exportSummary.instruments}`);
assert(exportSummary.valves === importSummary.valves, `valve count ${exportSummary.valves}`);
assert(exportSummary.safety_valves === importSummary.safety_valves, `PSV count ${exportSummary.safety_valves}`);

if (fs.existsSync(GOLDEN)) {
  const goldenXml = fs.readFileSync(path.join(GOLDEN, "plant-model-dexpi.xml"), "utf8");
  const goldenDraft = dexpiXmlToPlantModelDraft(goldenXml);
  assert(goldenDraft.objects.length >= 48, "golden import >= 48 objects");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
