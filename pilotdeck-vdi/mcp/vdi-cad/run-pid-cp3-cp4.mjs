#!/usr/bin/env node
/**
 * CP-3 + CP-4 — MEOH-100 P&ID
 * CP-3: PSV 位号清单 + 派单 PR-S03（安全泄压与火炬）
 * CP-4: 契约校验 + discipline_output.published + PID CAD（可选）
 *
 * 用法:
 *   node run-pid-cp3-cp4.mjs --lite
 *   node run-pid-cp3-cp4.mjs --no-cad
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { MEOH_PILOT, MEOH_PROJECT_ID, WORKSPACE_ROOT } from "../../config/pilot-paths.mjs";
import { disciplineOutputToCadCommand, buildMethanolFixture } from "./converter.mjs";
import * as cadClient from "./cad-client.mjs";
import { publishDrawingGenerated } from "./events.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../../..");
const ROOT = path.resolve(__dirname, "..");
const PROJECT = MEOH_PROJECT_ID;
const OUT = path.join(MEOH_PILOT, "outputs");
const CAD_OUT = path.join(MEOH_PILOT, "cad-output");
const TASK_PKG = path.join(MEOH_PILOT, ".pilotdeck/projects", MEOH_PROJECT_ID, "task-package.json");

const lite = process.argv.includes("--lite");
const skipCad = process.argv.includes("--no-cad");

const ORC = path.join(ROOT, "vdi-orchestrator/server.mjs");
const RULES = path.join(ROOT, "vdi-rules/server.mjs");
const EVENTS = path.join(ROOT, "vdi-events/server.mjs");

function mcpCall(serverPath, tool, args) {
  const req = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: tool, arguments: args },
  });
  const tmpFile = path.join(os.tmpdir(), `meoh-cp34-${Date.now()}.json`);
  try {
    writeFileSync(tmpFile, req + "\n", "utf8");
    const out = execSync(`node "${serverPath}" < "${tmpFile}"`, {
      timeout: 20000,
      maxBuffer: 2 * 1024 * 1024,
      shell: "/bin/bash",
      env: { ...process.env, VDI_WORKSPACE_ROOT: WORKSPACE_ROOT },
    });
    const parsed = JSON.parse(out.toString());
    const text = parsed.result?.content?.[0]?.text;
    if (!text) return { error: "empty response" };
    return JSON.parse(text);
  } catch (err) {
    return { error: (err.stdout?.toString() || err.message || String(err)).slice(0, 500) };
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }
}

function buildPsvList(liteMode) {
  const all = [
    {
      tag: "PSV-101",
      type: "PSV",
      protected_equipment: "R-101",
      set_P_MPaG: 2.8,
      design_P_MPaG: 3.2,
      discharge: "火炬系统",
      relief_to: "FLARE-001",
      scenarios: ["fire", "blocked_outlet", "cooling_failure"],
      medium: "合成气",
      status: "annotated_pending_sizing",
    },
    {
      tag: "PSV-201",
      type: "PSV",
      protected_equipment: "T-201",
      set_P_MPaG: 0.45,
      design_P_MPaG: 0.6,
      discharge: "放空",
      relief_to: "ATM",
      scenarios: ["blocked_outlet", "thermal_expansion"],
      medium: "甲醇",
      status: "annotated_pending_sizing",
    },
    {
      tag: "PSV-301",
      type: "PSV",
      protected_equipment: "E-301",
      set_P_MPaG: 2.6,
      design_P_MPaG: 3.0,
      discharge: "火炬系统",
      relief_to: "FLARE-001",
      scenarios: ["blocked_outlet", "cooling_failure"],
      medium: "反应气",
      status: "annotated_pending_sizing",
    },
    {
      tag: "PSV-401",
      type: "PSV",
      protected_equipment: "V-501",
      set_P_MPaG: 0.7,
      design_P_MPaG: 0.9,
      discharge: "放空",
      relief_to: "ATM",
      scenarios: ["blocked_outlet", "control_failure"],
      medium: "气液混合物",
      status: "annotated_pending_sizing",
    },
    {
      tag: "PSV-601",
      type: "PSV",
      protected_equipment: "C-601",
      set_P_MPaG: 2.9,
      design_P_MPaG: 3.2,
      discharge: "火炬系统",
      relief_to: "FLARE-001",
      scenarios: ["blocked_outlet", "surge"],
      medium: "循环气",
      status: "annotated_pending_sizing",
    },
    {
      tag: "RD-102",
      type: "RD",
      protected_equipment: "R-102",
      set_P_MPaG: 3.0,
      design_P_MPaG: 3.5,
      discharge: "火炬系统",
      relief_to: "FLARE-001",
      scenarios: ["runaway_reaction"],
      medium: "转化气",
      status: "annotated_pending_sizing",
    },
    {
      tag: "BD-201",
      type: "BD",
      protected_equipment: "T-201",
      set_P_MPaG: 0.5,
      design_P_MPaG: 0.6,
      discharge: "火炬系统",
      relief_to: "FLARE-001",
      scenarios: ["fire", "overpressure"],
      medium: "甲醇蒸气",
      status: "annotated_pending_sizing",
    },
  ];
  return liteMode ? all.slice(0, 4) : all;
}

function ensureReliefWbs(psvList) {
  if (!existsSync(TASK_PKG)) return { skipped: true, reason: "no task-package.json" };
  const pkg = JSON.parse(readFileSync(TASK_PKG, "utf8"));
  pkg.wbs_items = pkg.wbs_items || [];
  let wbs = pkg.wbs_items.find((w) => w.wbs_id === "PR-S03");
  if (!wbs) {
    wbs = {
      wbs_id: "PR-S03",
      title: "安全泄压与火炬 — 泄放量计算",
      discipline: "PR",
      skill: "安全泄压与火炬",
      description: "PSV/BD/RD 泄放量计算、火炬负荷汇总（PR-S03）",
      input_from: ["PR-S01"],
      output_to: ["PR-S01", "EQ"],
      estimated_hours: 16,
      milestone: "pid_30pct",
      risk_level: "high",
      depends_on: [],
      status: "pending",
    };
    pkg.wbs_items.push(wbs);
  } else if (wbs.status === "completed") {
    wbs.status = "pending";
  }
  pkg.updated_at = new Date().toISOString();
  writeFileSync(TASK_PKG, JSON.stringify(pkg, null, 2));
  return { wbs_id: wbs.wbs_id, status: wbs.status, psv_count: psvList.length };
}

function buildFormalPidOutput(testData, fixture, psvList, liteMode) {
  const pidDraftPath = path.join(OUT, "discipline-output-pid-draft.json");
  const base = existsSync(pidDraftPath)
    ? JSON.parse(readFileSync(pidDraftPath, "utf8"))
    : null;

  const equipmentTags = liteMode
    ? testData.equipment_draft_datasheets.tags_full.slice(0, 12)
    : testData.equipment_draft_datasheets.tags_full;
  const rawLines = liteMode ? fixture.payload.line_list.slice(0, 8) : fixture.payload.line_list;
  const controlLoops = liteMode
    ? testData.control_philosophy.loops.slice(0, 6)
    : testData.control_philosophy.loops;
  const causeEffect = liteMode
    ? testData.control_philosophy.cause_effect.slice(0, 5)
    : testData.control_philosophy.cause_effect;

  const lineList = rawLines.map((line, idx) => {
    const from = line.from || line.from_tag || "";
    const to = line.to || line.to_tag || "";
    const designT = line.design_T_C ?? 200 + idx * 5;
    const designP = line.design_P_MPaG ?? 1.6;
    return {
      line_id: line.line_no || `L-${1001 + idx}`,
      line_no: line.line_no,
      from,
      to,
      from_tag: from,
      to_tag: to,
      medium: line.fluid || "",
      fluid: line.fluid || "",
      Dn_mm: line.dn ?? 100,
      dn: line.dn ?? 100,
      phase: line.phase || "",
      design_T_C: designT,
      design_P_MPaG: designP,
      oper_T_C: Math.round(designT * 0.85),
      oper_P_MPaG: Number((designP * 0.75).toFixed(2)),
      material_class: "C1A",
      material: line.material || "CS",
      insulation: line.insulation || "none",
    };
  });

  return {
    discipline: "PR",
    output_type: "pid",
    project_id: PROJECT,
    object_id: "DO-PID-100-001",
    payload: {
      ...(base?.payload || {}),
      pid: {
        drawing_number: "PID-100-001",
        drawing_title: "甲醇合成装置管道仪表流程图",
        revision: "30%",
        equipment_tags: equipmentTags,
        control_loops: controlLoops,
        safety_valves: psvList.length,
      },
      line_list: lineList,
      cause_effect: causeEffect,
      safety_valve_list: psvList,
      pfd_reference: "PFD-100-001",
      cad_files: [],
    },
    citations: [
      { source_type: "standard", source_id: "HG/T 20570-2015", clause: "4.1" },
      { source_type: "standard", source_id: "HG/T 20549-2020", clause: "4.1" },
      { source_type: "standard", source_id: "API RP 520", clause: "4.1" },
      { source_type: "standard", source_id: "HG 20557.1-1993", clause: "3.2" },
    ],
    risk_level: "high",
    confidence: 0.88,
    status: "published",
  };
}

// ── main ──
mkdirSync(OUT, { recursive: true });
mkdirSync(CAD_OUT, { recursive: true });
process.env.VDI_WORKSPACE_ROOT = WORKSPACE_ROOT;

const testData = JSON.parse(
  readFileSync(path.join(WORKSPACE_ROOT, PROJECT, "test-inputs/pid-01-must-data.json"), "utf8")
);
const fixture = buildMethanolFixture();
const psvList = buildPsvList(lite);

console.log(`[CP-3] PSV/BD/RD 标注 — ${psvList.length} 项`);

const psvAnnotation = {
  project_id: PROJECT,
  drawing_number: "PID-100-001",
  revision: "30%",
  dispatched_to: "PR-S03",
  target_skill: "安全泄压与火炬",
  note: "本清单仅标注位号与保护场景，泄放量计算由 PR-S03 执行",
  items: psvList,
  citations: [{ source_id: "API RP 520", clause: "4.1" }],
};
writeFileSync(path.join(OUT, "psv-annotation-list.json"), JSON.stringify(psvAnnotation, null, 2));

const wbsInfo = ensureReliefWbs(psvList);
const dispatchInstruction = [
  "请对以下 PSV/BD/RD 位号执行 CP-0~CP-2：",
  `- 输入：PID-100-001 30% 版 + 工艺组/pilot/meoh-100/outputs/psv-annotation-list.json`,
  `- 设备数：${psvList.length}`,
  `- 要求：按 API RP 520/521 逐场景泄放量计算，输出 relief_system DisciplineOutput`,
  `- 禁止：合并不同危害场景泄放量`,
].join("\n");

let dispatch = { skipped: true };
if (!wbsInfo.skipped) {
  dispatch = mcpCall(ORC, "vdi_dispatch_task", {
    project_id: PROJECT,
    wbs_id: "PR-S03",
    instruction: dispatchInstruction,
  });
}

const reliefDispatch = {
  cp: "CP-3",
  project_id: PROJECT,
  from: "vdi-process-pid",
  to_skill: "vdi-process-relief",
  to_branch: "PR-S03",
  wbs: wbsInfo,
  dispatch,
  dispatch_instruction: dispatchInstruction,
  psv_count: psvList.length,
  artifact: "outputs/psv-annotation-list.json",
};
writeFileSync(path.join(OUT, "relief-dispatch-pr-s03.json"), JSON.stringify(reliefDispatch, null, 2));

console.log(
  `[CP-3] 派单 PR-S03:`,
  dispatch.dispatched ? "已派发" : dispatch.error || dispatch.skipped || "待确认"
);

// ── CP-4 ──
console.log("[CP-4] 正式 DisciplineOutput 提交…");
const formalOutput = buildFormalPidOutput(testData, fixture, psvList, lite);

const validation = mcpCall(RULES, "vdi_validate_discipline_output", {
  discipline: "PR",
  output: formalOutput,
});

const publishEvent = mcpCall(EVENTS, "vdi_publish_event", {
  project_id: PROJECT,
  event_type: "discipline_output.published",
  producer: "PR",
  payload: {
    object_id: formalOutput.object_id,
    object_type: "DisciplineOutput",
    discipline: "PR",
    output_type: "pid",
    drawing_number: "PID-100-001",
    revision: "30%",
    line_count: formalOutput.payload.line_list.length,
    psv_count: psvList.length,
  },
  trace_id: `TRACE-MEOH-PID-CP4-${Date.now()}`,
});

writeFileSync(
  path.join(OUT, "discipline-output-pid-published.json"),
  JSON.stringify(formalOutput, null, 2)
);

let rpcResult = { status: "skipped", message: "--no-cad" };
let cadCommand = null;
let drawingEvent = { published: false, skipped: "no-cad" };

if (!skipCad) {
  cadCommand = disciplineOutputToCadCommand(formalOutput, {
    drawing_type: "pid",
    project_id: PROJECT,
    project_name: "甲醇合成装置",
    output_directory: CAD_OUT,
    formats: lite ? ["FCStd"] : ["FCStd", "DXF"],
    revision: "30%",
  });
  cadCommand.options = { create_sheet: true, export_object_list: true };

  const conn = await cadClient.checkConnection();
  if (conn.connected) {
    console.log("[CP-4] PID CAD 出图…");
    rpcResult = await cadClient.execute(cadCommand);
    if (rpcResult.status === "success") {
      const fcPath = path.join(CAD_OUT, "PID-100-001.FCStd");
      formalOutput.payload.cad_files = rpcResult.exported || [{ format: "FCStd", path: fcPath }];
      writeFileSync(
        path.join(OUT, "discipline-output-pid-published.json"),
        JSON.stringify(formalOutput, null, 2)
      );
      drawingEvent = publishDrawingGenerated({
        project_id: PROJECT,
        payload: {
          drawing_type: "pid",
          drawing_number: "PID-100-001",
          revision: "30%",
          exported: rpcResult.exported || [],
          stats: rpcResult.stats || {},
          cp: "CP-4",
        },
      });
    }
  } else {
    rpcResult = { status: "skipped", message: conn.error || "RPC offline" };
  }
}

const summary = {
  cp3: {
    psv_count: psvList.length,
    dispatch: dispatch.dispatched ? "dispatched" : dispatch.error || "skipped",
    artifacts: ["psv-annotation-list.json", "relief-dispatch-pr-s03.json"],
  },
  cp4: {
    validation: validation.valid ? "passed" : validation.summary || validation.error,
    validation_issues: validation.issues || [],
    publish_event: publishEvent.event_id || publishEvent.error,
    status: formalOutput.status,
    cad: rpcResult.status,
    artifacts: ["discipline-output-pid-published.json"],
  },
};

writeFileSync(path.join(OUT, "pid-cp3-cp4-result.json"), JSON.stringify({ summary, validation, dispatch, publishEvent, rpcResult, drawingEvent }, null, 2));

console.log(JSON.stringify(summary, null, 2));

if (!validation.valid) {
  console.error("[CP-4] 契约校验未通过");
  process.exit(1);
}
