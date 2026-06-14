#!/usr/bin/env node
/** Export MEOH-100 workspace baseline + golden manifest with Phase 3/4 counts. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "crypto";
import { buildMethanolFixture } from "../converter.mjs";
import { disciplineOutputToPlantModel } from "../plant-converter.mjs";
import { countByClass } from "../plant-model-validator.mjs";
import { plantModelToObjectListCsv } from "../plant-object-export.mjs";
import { plantModelToDexpiXml } from "../dexpi-export.mjs";
import { appendChangeLog, syncViewRevisions } from "../revision-tracker.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../../..");
const WS = path.join(REPO, "workspaces/工艺组/pilot/meoh-100");
const GOLDEN = path.join(REPO, "pilotdeck-vdi/freecad/golden/meoh-100");

const fixture = buildMethanolFixture();
let plantModel = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });
plantModel = appendChangeLog(plantModel, {
  revision: plantModel.revision,
  action: "initial_import",
  summary: "MEOH-100 baseline import",
  object_ids: plantModel.objects.map((o) => o.object_id),
});
plantModel = syncViewRevisions(plantModel);
const counts = countByClass(plantModel);

const mustData = {
  project_id: "MEOH-100",
  material_balance: {
    closure_percent: 0.3,
    streams: fixture.payload.line_list.map((l, i) => ({
      stream_no: String(100 + i + 1),
      from: l.from,
      to: l.to,
      fluid: l.fluid,
      phase: l.phase,
    })),
  },
  equipment_draft_datasheets: {
    count: fixture.payload.pfd.equipment_tags.length,
    tags_full: fixture.payload.pfd.equipment_tags,
  },
  control_philosophy: {
    control_loops: fixture.payload.pid.control_loops,
    cause_effect: fixture.payload.cause_effect,
  },
  line_list: fixture.payload.line_list,
  safety_valve_list: fixture.payload.safety_valve_list,
};

for (const dir of [
  path.join(WS, "test-inputs"),
  path.join(WS, "plant"),
  path.join(WS, "cad-output"),
  path.join(WS, "outputs"),
  path.join(WS, "events/inbox"),
  GOLDEN,
]) {
  fs.mkdirSync(dir, { recursive: true });
}

fs.writeFileSync(path.join(WS, "test-inputs/pid-01-must-data.json"), JSON.stringify(mustData, null, 2));
fs.writeFileSync(path.join(WS, "plant/model.json"), JSON.stringify(plantModel, null, 2));
fs.writeFileSync(path.join(GOLDEN, "plant-model-baseline.json"), JSON.stringify(plantModel, null, 2));
fs.writeFileSync(path.join(GOLDEN, "object-list-baseline.csv"), plantModelToObjectListCsv(plantModel));
fs.writeFileSync(path.join(GOLDEN, "plant-model-dexpi.xml"), plantModelToDexpiXml(plantModel, { discipline: "PID" }));

const checksum = createHash("sha256").update(JSON.stringify(plantModel.objects)).digest("hex").slice(0, 16);
const attrChecksum = createHash("sha256")
  .update(
    JSON.stringify(
      plantModel.objects.map((o) => ({
        tag: o.tag,
        class: o.class,
        attributes: o.attributes,
      }))
    )
  )
  .digest("hex")
  .slice(0, 16);

fs.writeFileSync(
  path.join(GOLDEN, "manifest.json"),
  JSON.stringify(
    {
      project_id: "MEOH-100",
      object_count: plantModel.objects.length,
      equipment: counts.Equipment || 0,
      pipe_runs: counts.PipeRun || 0,
      instruments: counts.Instrument || 0,
      valves: counts.Valve || 0,
      safety_valves: counts.SafetyValve || 0,
      control_loops: counts.ControlLoop || 0,
      change_log_entries: plantModel.change_log?.length || 0,
      dexpi_equipment: counts.Equipment || 0,
      checksum,
      attribute_checksum: attrChecksum,
      generated_at: new Date().toISOString(),
    },
    null,
    2
  )
);

console.log("Exported MEOH-100 baseline:");
console.log(" ", path.join(WS, "plant/model.json"));
console.log(" ", path.join(GOLDEN, "plant-model-baseline.json"));
console.log(" ", path.join(GOLDEN, "object-list-baseline.csv"));
console.log(" ", path.join(GOLDEN, "plant-model-dexpi.xml"));
console.log(" ", path.join(GOLDEN, "manifest.json"));
console.log(`Objects: ${plantModel.objects.length}, checksum: ${checksum}`);
