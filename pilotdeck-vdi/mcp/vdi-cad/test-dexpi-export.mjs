#!/usr/bin/env node
/** Phase 6 — DEXPI export, CFIHOS mapping, revision traceability. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMethanolFixture } from "./converter.mjs";
import { disciplineOutputToPlantModel } from "./plant-converter.mjs";
import { plantModelToDexpiXml, dexpiExportSummary, getCfihosMapping } from "./dexpi-export.mjs";
import { plantModelToCfihosJson, cfihosExportSummary } from "./cfihos-export.mjs";
import {
  applyPlantDelta,
  syncViewRevisions,
  validateRevisionConsistency,
  nextRevision,
  appendChangeLog,
} from "./revision-tracker.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.resolve(__dirname, "../../freecad/golden/meoh-100");

const fixture = buildMethanolFixture();
let model = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });
model = appendChangeLog(model, {
  revision: model.revision,
  action: "initial_import",
  summary: "MEOH-100 baseline import",
  object_ids: model.objects.map((o) => o.object_id),
});
model = syncViewRevisions(model);

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

console.log("Phase 6 DEXPI / CFIHOS / revision tests\n");

const mapping = getCfihosMapping();
assert(mapping.mappings?.Equipment?.design_P_MPaG?.cfihos === "design_pressure", "CFIHOS mapping design_pressure");
assert(mapping.mappings?.PipeRun?.dn?.cfihos === "nominal_diameter", "CFIHOS mapping nominal_diameter");

const xml = plantModelToDexpiXml(model, { discipline: "PID" });
assert(xml.startsWith('<?xml version="1.0"'), "DEXPI XML declaration");
assert(xml.includes("<PlantModel"), "DEXPI PlantModel root");
assert(xml.includes('OriginatingSystem="PilotDeck-VDI"'), "DEXPI originating system");
assert(xml.includes('Name="Revision" Value="A"'), "DEXPI revision in PlantInformation");
assert((xml.match(/<Equipment/g) || []).length === 48, "DEXPI 48 Equipment");
assert((xml.match(/<PipingNetworkSegment/g) || []).length === 32, "DEXPI 32 PipingNetworkSegment");
assert((xml.match(/<InstrumentationLoopFunction/g) || []).length === 12, "DEXPI 12 instruments");
assert((xml.match(/<OperatedValve/g) || []).length === 32, "DEXPI 32 valves");
assert((xml.match(/<SafetyValveOrFitting/g) || []).length === 5, "DEXPI 5 PSVs");
assert(xml.includes("TagName=\"P-401\""), "DEXPI equipment tag P-401");

const summary = dexpiExportSummary(model);
assert(summary.equipment === 48 && summary.pipe_segments === 32, "DEXPI export summary counts");

const cfihos = plantModelToCfihosJson(model);
assert(cfihos.objects.length === 48 + 32 + 12 + 32 + 5, `CFIHOS ${cfihos.objects.length} exportable objects`);
const pump = cfihos.objects.find((o) => o.tag === "P-401");
assert(pump?.design_pressure != null, "CFIHOS P-401 has design_pressure");
assert(pump?.design_pressure_unit === "MPa(g)", "CFIHOS design_pressure unit");
const cfSum = cfihosExportSummary(model);
assert(cfSum.by_class.Equipment === 48, "CFIHOS equipment count");

assert(nextRevision("A") === "B", "nextRevision A→B");
assert(nextRevision("Z") === "Z1", "nextRevision Z→Z1");

const eq = model.objects.find((o) => o.tag === "P-401");
const updated = applyPlantDelta(model, {
  objects: [{
    object_id: eq.object_id,
    class: "Equipment",
    tag: "P-401",
    attributes: { design_P_MPaG: 3.0 },
  }],
  author: "test",
  summary: "Bump design pressure",
});
assert(updated.revision === "B", "applyPlantDelta bumps revision to B");
assert(updated.change_log.length >= 2, "change_log appended");
assert(
  updated.views.every((v) => v.title_block?.revision === "B"),
  "view title_block.revision synced to B"
);
const revCheck = validateRevisionConsistency(updated);
assert(revCheck.ok, "revision consistency ok after sync");

const goldenPath = path.join(GOLDEN, "plant-model-dexpi.xml");
if (fs.existsSync(goldenPath)) {
  const golden = fs.readFileSync(goldenPath, "utf8");
  const goldenEquip = (golden.match(/<Equipment/g) || []).length;
  const xmlEquip = (xml.match(/<Equipment/g) || []).length;
  assert(goldenEquip === xmlEquip, `golden DEXPI equipment count ${goldenEquip}`);
} else {
  console.log("  (skip golden DEXPI diff — run export:meoh-baseline first)");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
