#!/usr/bin/env node
/**
 * Phase 7 — MEOH-100 acceptance gate (§8.2 offline checks).
 * Aggregates PlantModel / PFD / P&ID / multi-view / DEXPI / revision criteria.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMethanolFixture } from "./converter.mjs";
import {
  disciplineOutputToPlantModel,
  plantModelToCadCommand,
  resolveViewId,
} from "./plant-converter.mjs";
import { validatePlantModelForPublish, countByClass } from "./plant-model-validator.mjs";
import { plantModelToObjectListCsv, equipmentDesignSummary } from "./plant-object-export.mjs";
import { plantModelToDexpiXml, dexpiExportSummary } from "./dexpi-export.mjs";
import { plantModelToCfihosJson } from "./cfihos-export.mjs";
import { applyPlantDelta, syncViewRevisions, validateRevisionConsistency } from "./revision-tracker.mjs";
import { formatPlantObject, getObjectByTag } from "./plant-object-lookup.mjs";
import { buildDrawingManifest, resolvePickFromManifest } from "./manifest-export.mjs";
import { resolveGbt51296Class } from "./plant-object-export.mjs";
import { dexpiXmlToPlantModelDraft } from "./dexpi-import.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../..");
const GOLDEN = path.join(REPO, "pilotdeck-vdi/freecad/golden/meoh-100");

let passed = 0;
let failed = 0;
const sections = [];

function section(name) {
  sections.push({ name, passed: 0, failed: 0 });
  console.log(`\n── ${name} ──`);
}

function assert(cond, msg) {
  const s = sections[sections.length - 1];
  if (cond) {
    passed++;
    if (s) s.passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    if (s) s.failed++;
    console.error(`  ✗ ${msg}`);
  }
}

console.log("Phase 7 — MEOH-100 acceptance gate (offline)\n");

const fixture = buildMethanolFixture();
let model = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });
model = syncViewRevisions(model);
const counts = countByClass(model);

// ── PlantModel M0 (Phase P) ──
section("PlantModel M0");
assert(model.objects.length >= 141, `total objects >=141 (${model.objects.length})`);
assert(counts.Equipment === 48, "48 Equipment");
assert(counts.PipeRun === 32, "32 PipeRun");
assert(counts.Instrument === 12, "12 Instrument");
assert(counts.Valve === 32, "32 Valve");
assert(counts.SafetyValve === 5, "5 SafetyValve");
assert(counts.ControlLoop === 12, "12 ControlLoop");
assert(model.objects.every((o) => o.object_id), "all objects have UUID");
const ids = new Set(model.objects.map((o) => o.object_id));
assert(ids.size === model.objects.length, "object_id unique");
assert(model.views.length >= 5, "5+ ViewDefinitions");
assert(model.views.some((v) => v.view_type === "pfd"), "pfd view");
assert(model.views.some((v) => v.view_type === "pid"), "pid view");
assert(model.views.some((v) => v.view_type === "layout"), "layout view");
assert(model.views.some((v) => v.view_type === "isometric"), "isometric view");
assert(model.views.some((v) => v.view_type === "3d"), "3d view");

const eqSummary = equipmentDesignSummary(model);
assert(eqSummary.complete, "equipment design conditions complete (48/48)");

// ── Phase 2 layout ──
section("Phase 2 layout");
const pfdCmd = plantModelToCadCommand(model, { drawing_type: "pfd", project_id: "MEOH-100" });
assert(pfdCmd.equipment.length === 48, "PFD CadCommand 48 equipment");
assert(pfdCmd.equipment.every((e) => e.position?.x != null), "PFD equipment has positions");
assert(pfdCmd.lines.length === 32, "PFD 32 lines");
assert(pfdCmd.lines.every((l) => l.waypoints?.length >= 2 || l.from_tag), "lines have routing or tags");

// ── Phase 3 P&ID semantics ──
section("Phase 3 P&ID semantics");
const pidCmd = plantModelToCadCommand(model, { drawing_type: "pid", project_id: "MEOH-100" });
assert((pidCmd.valves?.length || 0) === 32, "PID 32 valves");
assert((pidCmd.safety_valves?.length || pidCmd.tables?.safety_valves?.length || 0) >= 5, "PID >=5 PSV");
assert((pidCmd.control_loops?.length || 0) === 12, "PID 12 control loops");
assert((pidCmd.signal_lines?.length || 0) >= 12, "PID signal lines");
const pipeTable = pidCmd.tables?.pipe_list || [];
assert(pipeTable.length === 32, "pipe table 32 rows from PipeRun");

// ── Phase 4 publish gate ──
section("Phase 4 publish");
const validation = validatePlantModelForPublish(model, { min_equipment: 48 });
assert(validation.publishable, "PlantModel publishable");
assert(validation.error_count === 0, "zero validation errors");
const csv = plantModelToObjectListCsv(model);
assert(csv.includes("object_id") && csv.includes("P-401"), "object list CSV");
assert(pfdCmd.options?.create_sheet !== false, "create_sheet default true");

// ── Phase 5 multi-view ──
section("Phase 5 multi-view");
for (const dt of ["layout", "isometric", "3d"]) {
  const cmd = plantModelToCadCommand(model, { drawing_type: dt, project_id: "MEOH-100" });
  assert(cmd.drawing_type === dt, `${dt} CadCommand type`);
  assert(cmd.view_id === resolveViewId("MEOH-100", dt), `${dt} view_id`);
  assert(cmd.equipment[0]?.parameters?.footprint_x != null, `${dt} footprint`);
}
const cmd3d = plantModelToCadCommand(model, { drawing_type: "3d" });
assert(cmd3d.output.formats.includes("STEP"), "3d formats include STEP");

// ── Phase 6 DEXPI / CFIHOS / revision ──
section("Phase 6 exchange");
const dexpi = plantModelToDexpiXml(model);
const dexSum = dexpiExportSummary(model);
assert(dexSum.equipment === 48 && dexSum.pipe_segments === 32, "DEXPI summary counts");
assert(dexpi.includes('Name="Revision"'), "DEXPI revision attribute");
assert((dexpi.match(/<Equipment/g) || []).length === 48, "DEXPI 48 Equipment XML");
const cfihos = plantModelToCfihosJson(model);
assert(cfihos.objects.length === 129, "CFIHOS 129 objects");
assert(fs.existsSync(path.join(__dirname, "schemas/cfihos-vdi-mapping.json")), "CFIHOS mapping file");

const eq = model.objects.find((o) => o.tag === "P-401");
const bumped = applyPlantDelta(model, {
  objects: [{ object_id: eq.object_id, class: "Equipment", tag: "P-401", attributes: { design_P_MPaG: 2.6 } }],
  summary: "acceptance gate test",
});
assert(bumped.revision === "B", "revision bump A→B");
assert(validateRevisionConsistency(bumped).ok, "revision consistency");

if (fs.existsSync(path.join(GOLDEN, "manifest.json"))) {
  const manifest = JSON.parse(fs.readFileSync(path.join(GOLDEN, "manifest.json"), "utf8"));
  assert(manifest.object_count === 141, "golden manifest object_count");
  assert(fs.existsSync(path.join(GOLDEN, "plant-model-dexpi.xml")), "golden DEXPI sample");
}

// ── Phase 8–10 pick / handover ──
section("Phase 8–10 pick & handover");

const p401 = model.objects.find((o) => o.tag === "P-401");
const fmt = formatPlantObject(p401);
assert(fmt.fields.some((f) => f.key === "design_P_MPaG"), "Phase 8 formatted design_P");
assert(getObjectByTag(model, "R-101")?.class === "Equipment", "Phase 8c getObjectByTag");

const pickManifest = buildDrawingManifest(model, { drawing_number: "PFD-100-001-PREVIEW", sheet_size: "A1" });
assert(pickManifest.objects.length >= 12, "Phase 9 manifest objects");
const r101m = pickManifest.objects.find((o) => o.tag === "R-101");
if (r101m?.bbox_view) {
  const cx = r101m.bbox_view.x + r101m.bbox_view.w / 2;
  const cy = r101m.bbox_view.y + r101m.bbox_view.h / 2;
  const pick = resolvePickFromManifest(pickManifest, cx, cy);
  assert(pick.status === "hit" && pick.tag === "R-101", "Phase 9 resolve_pick R-101");
}

const gbt = resolveGbt51296Class(p401);
assert(gbt.class_code?.startsWith("EQP"), "Phase 10 51296 class code");
assert(fs.existsSync(path.join(__dirname, "schemas/gbt51296-class-map.json")), "Phase 10 class map file");

const dexpiDraft = dexpiXmlToPlantModelDraft(plantModelToDexpiXml(model));
assert(dexpiDraft.objects.filter((o) => o.class === "Equipment").length === 48, "Phase 10 DEXPI import equipment");

if (fs.existsSync(path.join(GOLDEN, "drawing-manifest-preview.json"))) {
  const gm = JSON.parse(fs.readFileSync(path.join(GOLDEN, "drawing-manifest-preview.json"), "utf8"));
  assert(gm.objects.length >= 12, "golden drawing-manifest preview");
}

// ── Automation registry ──
section("Automation (PR gate)");
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8"));
const requiredScripts = [
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
  "test:acceptance",
  "handover:pack",
];
for (const s of requiredScripts) {
  assert(pkg.scripts[s], `package.json script ${s}`);
}

console.log("\n── Summary ──");
for (const s of sections) {
  console.log(`  ${s.name}: ${s.passed} passed${s.failed ? `, ${s.failed} failed` : ""}`);
}
console.log(`\nTotal: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
