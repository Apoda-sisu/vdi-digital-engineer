#!/usr/bin/env node
/** Phase 3 — P&ID semantics: Valve / Instrument / SafetyValve / ControlLoop */

import {
  disciplineOutputToPlantModel,
  plantModelToCadCommand,
} from "./plant-converter.mjs";
import { buildMethanolFixture, disciplineOutputToCadCommand } from "./converter.mjs";

const fixture = buildMethanolFixture();
const model = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });
const cmd = plantModelToCadCommand(model, { drawing_type: "pid" });

const byClass = (cls) => model.objects.filter((o) => o.class === cls);
const equipment = byClass("Equipment");
const pipes = byClass("PipeRun");
const instruments = byClass("Instrument");
const valves = byClass("Valve");
const psvs = byClass("SafetyValve");
const loops = byClass("ControlLoop");

const valveTypes = new Set(valves.map((v) => v.attributes.valve_type));
const pipesWithInline = pipes.filter((p) =>
  (p.relationships || []).some((r) => r.type === "connected_by" && r.role === "inline")
);

const tic = instruments.find((i) => i.tag === "TIC-101");
const pidView = model.views.find((v) => v.view_type === "pid");
const ticPlacement = tic ? pidView?.placements?.[tic.object_id] : null;

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

console.log("Phase 3 P&ID semantics\n");

assert(equipment.length === 48, `48 equipment (${equipment.length})`);
assert(pipes.length === 32, `32 PipeRun (${pipes.length})`);
assert(instruments.length >= 12, `12+ Instrument (${instruments.length})`);
assert(valves.length === 32, `32 inline Valve (${valves.length})`);
assert(psvs.length === 5, `5 SafetyValve (${psvs.length})`);
assert(loops.length >= 12, `12 ControlLoop (${loops.length})`);

assert(valveTypes.has("gate") && valveTypes.has("ball") && valveTypes.has("check"), "gate/ball/check valve types");
assert(pipesWithInline.length === 32, `PipeRun connected_by inline (${pipesWithInline.length})`);

assert(tic?.attributes?.range, "TIC-101 has editable range attribute");
assert(ticPlacement?.x != null, "TIC-101 has pid view placement");

assert(cmd.valves?.length === 32, `CadCommand valves (${cmd.valves?.length})`);
assert(cmd.safety_valves?.length === 5, `CadCommand PSV (${cmd.safety_valves?.length})`);
assert(cmd.control_loops?.length >= 12, `CadCommand control loops (${cmd.control_loops?.length})`);
assert(cmd.signal_lines?.length >= 12, `CadCommand signal lines (${cmd.signal_lines?.length})`);
assert(cmd.tables?.pipe_list?.length === 32, `pipe table from PipeRun (${cmd.tables?.pipe_list?.length})`);

const legacy = disciplineOutputToCadCommand(fixture, { drawing_type: "pid" });
assert(legacy.valves?.length === 32, "legacy converter includes valves");

const mergedCount = model.objects.length;
assert(mergedCount >= 141, `PlantModel total objects >=141 (${mergedCount})`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
