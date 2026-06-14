/**
 * DisciplineOutput → CadCommand v1 converter.
 * Internally: DisciplineOutput → PlantModel → CadCommand (view snapshot).
 */

import {
  disciplineOutputToPlantModel,
  plantModelToCadCommand,
  mergePlantModel,
  autoLayoutEquipment,
  extractEquipmentTags,
  inferEquipmentType,
  inferInstrumentType,
  collectControlLoops,
  normalizeLines,
  buildInstrumentSpecs,
  TAG_PREFIX_TYPE,
} from "./plant-converter.mjs";

export {
  disciplineOutputToPlantModel,
  plantModelToCadCommand,
  mergePlantModel,
  autoLayoutEquipment,
  extractEquipmentTags,
  inferEquipmentType,
  inferInstrumentType,
  TAG_PREFIX_TYPE,
};

function buildStreams(payload, lines) {
  const streamCount = payload.pfd?.streams;
  if (typeof streamCount === "number" && streamCount > 0 && lines.length === 0) {
    return Array.from({ length: Math.min(streamCount, 32) }, (_, i) => ({
      stream_no: String(100 + i + 1),
      flow: "",
      phase: "mixed",
    }));
  }

  return lines.map((line, i) => ({
    stream_no: line.stream_no || String(100 + i + 1),
    from_tag: line.from_tag,
    to_tag: line.to_tag,
    flow: line.fluid || "",
    phase: line.phase || "",
    P_MPa: line.design_P_MPaG,
    T_C: line.design_T_C,
  }));
}

/** @deprecated use buildInstrumentSpecs from plant-converter */
function buildInstruments(payload) {
  return buildInstrumentSpecs(payload);
}

/**
 * Convert DisciplineOutput to CadCommand v1 via PlantModel.
 */
export function disciplineOutputToCadCommand(disciplineOutput, options = {}) {
  const payload = disciplineOutput.payload || {};
  const outputType = disciplineOutput.output_type || "pfd_pid";
  let drawingType = options.drawing_type;
  if (!drawingType) {
    if (outputType === "pid") drawingType = "pid";
    else if (outputType === "pfd") drawingType = "pfd";
    else drawingType = outputType === "pfd_pid" ? "pid" : "pfd";
  }
  if (options.drawing_type) drawingType = options.drawing_type;

  const plantModel = disciplineOutputToPlantModel(disciplineOutput, options);
  const command = plantModelToCadCommand(plantModel, { ...options, drawing_type: drawingType });

  // Enrich line attributes from payload when present
  const lines = normalizeLines(payload.line_list);
  if (lines.length && command.lines.length) {
    command.lines = command.lines.map((cl, i) => ({
      ...cl,
      ...(lines[i] || {}),
      object_id: cl.object_id,
    }));
  }

  // Fill equipment parameters from line-adjacent design data when available
  command.equipment = command.equipment.map((eq) => {
    const connectedLines = lines.filter(
      (l) => l.from_tag === eq.tag || l.to_tag === eq.tag
    );
    const refLine = connectedLines[0];
    const params = { ...eq.parameters };
    if (refLine?.design_P_MPaG != null && params.design_P_MPaG == null) {
      params.design_P_MPaG = refLine.design_P_MPaG;
    }
    if (refLine?.design_T_C != null && params.design_T_C == null) {
      params.design_T_C = refLine.design_T_C;
    }
    return { ...eq, parameters: params };
  });

  if (!command.streams?.length) {
    command.streams = buildStreams(payload, lines);
  }

  return command;
}

/**
 * Merge PR-D04 (pfd) + PR-S01 (pid) + PR-S05 (control) outputs for CAD generation.
 */
export function mergeDisciplineOutputsForCad(outputs = []) {
  const merged = {
    discipline: "process",
    output_type: "pfd_pid",
    payload: { pfd: {}, pid: {}, line_list: [], cause_effect: [] },
    citations: [],
  };
  for (const o of outputs) {
    if (!o?.payload) continue;
    if (o.output_type === "pfd") {
      merged.payload.pfd = { ...merged.payload.pfd, ...o.payload.pfd };
      merged.payload.battery_limits = o.payload.battery_limits || merged.payload.battery_limits;
      merged.payload.stream_table = o.payload.stream_table || merged.payload.stream_table;
    }
    if (o.output_type === "pid") {
      merged.payload.pid = { ...merged.payload.pid, ...o.payload.pid };
      merged.payload.line_list = o.payload.line_list || merged.payload.line_list;
    }
    if (o.output_type === "control_philosophy") {
      merged.payload.cause_effect = o.payload.cause_effect || o.payload.interlock_matrix || merged.payload.cause_effect;
    }
    if (o.output_type === "pfd_pid") {
      merged.payload = { ...merged.payload, ...o.payload };
    }
    merged.citations.push(...(o.citations || []));
  }
  return merged;
}

/**
 * Build methanol plant E2E fixture (32 streams / 48 equipment / 12 loops).
 */
export function buildMethanolFixture() {
  const equipmentTags = [];
  equipmentTags.push("R-101", "R-102");
  for (let i = 1; i <= 8; i++) equipmentTags.push(`T-${200 + i}`);
  for (let i = 1; i <= 12; i++) equipmentTags.push(`E-${300 + i}`);
  for (let i = 1; i <= 10; i++) equipmentTags.push(`P-${400 + i}`);
  for (let i = 1; i <= 8; i++) equipmentTags.push(`V-${500 + i}`);
  for (let i = 1; i <= 8; i++) equipmentTags.push(`C-${600 + i}`);

  const lineList = [];
  for (let i = 0; i < 32; i++) {
    const from = equipmentTags[i % equipmentTags.length];
    const to = equipmentTags[(i + 1) % equipmentTags.length];
    lineList.push({
      line_no: `100-P-${101 + i}-12"-C1A`,
      from,
      to,
      fluid: i % 3 === 0 ? "合成气" : i % 3 === 1 ? "甲醇" : "循环气",
      phase: i % 2 === 0 ? "gas" : "liquid",
      design_P_MPaG: 1.6 + (i % 5) * 0.4,
      design_T_C: 200 + i * 5,
      dn: 100 + (i % 6) * 50,
      material: "CS",
      insulation: i % 4 === 0 ? "hot" : "none",
    });
  }

  const causeEffect = Array.from({ length: 10 }, (_, i) => ({
    cause: `R-10${(i % 2) + 1} 温度 HH`,
    effect: `切断进料阀 XV-${101 + i}`,
    sensor: `TIC-${101 + i}`,
  }));

  const safetyValveList = [
    { tag: "PSV-101", protected_equipment: "R-101", set_P_MPaG: 2.8, discharge: "火炬系统" },
    { tag: "PSV-201", protected_equipment: "T-201", set_P_MPaG: 0.45, discharge: "放空" },
    { tag: "PSV-301", protected_equipment: "E-301", set_P_MPaG: 2.6, discharge: "火炬系统" },
    { tag: "PSV-401", protected_equipment: "V-501", set_P_MPaG: 0.7, discharge: "放空" },
    { tag: "PSV-601", protected_equipment: "C-601", set_P_MPaG: 2.9, discharge: "火炬系统" },
  ];

  return {
    discipline: "process",
    output_type: "pfd_pid",
    project_id: "MEOH-100",
    payload: {
      pfd: {
        drawing_number: "PFD-100-001",
        equipment_tags: equipmentTags,
        streams: 32,
      },
      pid: {
        drawing_number: "PID-100-001",
        control_loops: 12,
        safety_valves: 5,
      },
      line_list: lineList,
      cause_effect: causeEffect,
      safety_valve_list: safetyValveList,
    },
    citations: [
      { source_type: "standard", source_id: "HG/T 20570-2015", clause: "5.2" },
      { source_type: "standard", source_id: "HG/T 20549-2020", clause: "4.1" },
    ],
    risk_level: "high",
    confidence: 0.9,
    status: "draft",
  };
}
