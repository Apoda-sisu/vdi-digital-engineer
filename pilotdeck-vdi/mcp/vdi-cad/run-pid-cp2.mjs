#!/usr/bin/env node
/**
 * CP-2 P&ID — MEOH-100 甲醇装置
 * 交付：P&ID 30% DisciplineOutput + Line List + FreeCAD PID 出图
 *
 * 用法:
 *   node run-pid-cp2.mjs           # 48 设备 / 32 管线 / 12 回路
 *   node run-pid-cp2.mjs --lite    # 12 设备 / 8 管线 / 6 回路
 *   node run-pid-cp2.mjs --no-cad  # 仅 JSON，不调 FreeCAD
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MEOH_PILOT, MEOH_PROJECT_ID, WORKSPACE_ROOT } from "../../config/pilot-paths.mjs";
import { disciplineOutputToCadCommand, buildMethanolFixture } from "./converter.mjs";
import * as cadClient from "./cad-client.mjs";
import { publishDrawingGenerated } from "./events.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../..");
const OUT = path.join(MEOH_PILOT, "outputs");
const CAD_OUT = path.join(MEOH_PILOT, "cad-output");

const testData = JSON.parse(
  readFileSync(path.join(MEOH_PILOT, "test-inputs/pid-01-must-data.json"), "utf8")
);
const fixture = buildMethanolFixture();

const lite = process.argv.includes("--lite");
const skipCad = process.argv.includes("--no-cad");

function operFromDesign(designT, designP) {
  return {
    oper_T_C: Math.round((designT || 200) * 0.85),
    oper_P_MPaG: Number(((designP || 2) * 0.75).toFixed(2)),
  };
}

/** CP-2 Line List — 契约字段 + CAD 布线字段 */
function buildLineList(rawLines) {
  return rawLines.map((line, idx) => {
    const from = line.from || line.from_tag || "";
    const to = line.to || line.to_tag || "";
    const designT = line.design_T_C ?? 200 + idx * 5;
    const designP = line.design_P_MPaG ?? 1.6;
    const oper = operFromDesign(designT, designP);
    return {
      line_id: line.line_no || `L-${1001 + idx}`,
      line_no: line.line_no || `100-P-${101 + idx}-12"-C1A`,
      from,
      to,
      from_tag: from,
      to_tag: to,
      medium: line.fluid || line.medium || "",
      fluid: line.fluid || line.medium || "",
      Dn_mm: line.dn ?? line.Dn_mm ?? 100,
      dn: line.dn ?? line.Dn_mm ?? 100,
      phase: line.phase || "",
      design_T_C: designT,
      design_P_MPaG: designP,
      oper_T_C: line.oper_T_C ?? oper.oper_T_C,
      oper_P_MPaG: line.oper_P_MPaG ?? oper.oper_P_MPaG,
      material_class: line.material_class || "C1A",
      material: line.material || "CS",
      insulation: line.insulation || "none",
    };
  });
}

const equipmentTags = lite
  ? testData.equipment_draft_datasheets.tags_full.slice(0, 12)
  : testData.equipment_draft_datasheets.tags_full;
const rawLines = lite ? fixture.payload.line_list.slice(0, 8) : fixture.payload.line_list;
const controlLoops = lite
  ? testData.control_philosophy.loops.slice(0, 6)
  : testData.control_philosophy.loops;
const causeEffect = lite
  ? testData.control_philosophy.cause_effect.slice(0, 5)
  : testData.control_philosophy.cause_effect;

const safetyValves = [
  { tag: "PSV-101", protected_equipment: "R-101", set_P_MPaG: 2.8, discharge: "火炬系统" },
  { tag: "PSV-201", protected_equipment: "T-201", set_P_MPaG: 0.45, discharge: "放空" },
  { tag: "PSV-301", protected_equipment: "E-301", set_P_MPaG: 2.6, discharge: "火炬系统" },
  { tag: "PSV-401", protected_equipment: "V-501", set_P_MPaG: 0.7, discharge: "放空" },
  { tag: "PSV-601", protected_equipment: "C-601", set_P_MPaG: 2.9, discharge: "火炬系统" },
].slice(0, lite ? 3 : 5);

const lineList = buildLineList(rawLines);

const disciplineOutput = {
  discipline: "process",
  output_type: "pid",
  project_id: MEOH_PROJECT_ID,
  payload: {
    pid: {
      drawing_number: "PID-100-001",
      drawing_title: "甲醇合成装置管道仪表流程图",
      revision: "30%",
      equipment_tags: equipmentTags,
      control_loops: controlLoops,
      safety_valves: safetyValves.length,
    },
    line_list: lineList,
    cause_effect: causeEffect,
    safety_valve_list: safetyValves,
    pfd_reference: "PFD-100-001",
  },
  citations: [
    { source_type: "standard", source_id: "HG/T 20570-2015", clause: "4.1" },
    { source_type: "standard", source_id: "HG/T 20549-2020", clause: "4.1" },
    { source_type: "standard", source_id: "HG 20557.1-1993", clause: "3.2" },
  ],
  risk_level: "high",
  confidence: 0.86,
  status: "draft",
};

mkdirSync(OUT, { recursive: true });
mkdirSync(CAD_OUT, { recursive: true });
process.env.VDI_WORKSPACE_ROOT = path.join(REPO, "workspaces");

writeFileSync(
  path.join(OUT, "discipline-output-pid-draft.json"),
  JSON.stringify(disciplineOutput, null, 2)
);
writeFileSync(
  path.join(OUT, "line-list-draft.json"),
  JSON.stringify(
    {
      project_id: MEOH_PROJECT_ID,
      drawing_number: "PID-100-001",
      revision: "30%",
      line_count: lineList.length,
      lines: lineList,
      citations: disciplineOutput.citations,
    },
    null,
    2
  )
);

console.log(
  `[CP-2] P&ID 30% — ${equipmentTags.length} 设备, ${lineList.length} 管线, ${controlLoops.length} 回路`
);

let rpcResult = { status: "skipped", message: "--no-cad" };
let cadCommand = null;
let event = { published: false, skipped: "no-cad" };

if (!skipCad) {
  cadCommand = disciplineOutputToCadCommand(disciplineOutput, {
    drawing_type: "pid",
    project_id: MEOH_PROJECT_ID,
    project_name: "甲醇合成装置",
    output_directory: CAD_OUT,
    formats: lite ? ["FCStd"] : ["FCStd", "DXF"],
    revision: "30%",
  });
  cadCommand.options = { create_sheet: true, export_object_list: true };

  console.log("[CP-2] RPC check...");
  const conn = await cadClient.checkConnection();
  if (!conn.connected) {
    console.error("FreeCAD RPC offline:", conn.error);
    process.exit(2);
  }

  console.log("[CP-2] Generating P&ID in FreeCAD...");
  rpcResult = await cadClient.execute(cadCommand);

  event =
    rpcResult.status === "success"
      ? publishDrawingGenerated({
          project_id: MEOH_PROJECT_ID,
          payload: {
            drawing_type: "pid",
            drawing_number: "PID-100-001",
            revision: "30%",
            exported: rpcResult.exported || [],
            stats: rpcResult.stats || {},
            cp: "CP-2",
          },
        })
      : { published: false, skipped: "RPC error" };
}

const result = { disciplineOutput, cadCommand, rpcResult, event };
const outPath = path.join(OUT, "pid-cp2-result.json");
writeFileSync(outPath, JSON.stringify(result, null, 2));

console.log(
  JSON.stringify(
    {
      status: rpcResult.status,
      line_count: lineList.length,
      loops: controlLoops.length,
      interlocks: causeEffect.length,
      exported: rpcResult.exported,
      stats: rpcResult.stats,
      view: rpcResult.view,
      event,
      outPath,
    },
    null,
    2
  )
);

if (rpcResult.status !== "success" && !skipCad) {
  console.error("[CP-2] FAILED:", rpcResult.message || rpcResult);
  process.exit(1);
}
