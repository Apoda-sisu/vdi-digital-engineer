/**
 * DisciplineOutput → PlantModel v1 → CadCommand v1
 * PlantModel is the source of truth; CadCommand is a view snapshot.
 */

import { createHash } from "crypto";
import { autoLayoutEquipment, fitLayoutToPage, computeSymbolScale, computeSymbolScaleFromLayout } from "./layout-engine.mjs";
import {
  computePidPlacements,
  inferValveType,
  valveTagForLine,
} from "./pid-layout.mjs";

export { autoLayoutEquipment, sugiyamaLayout, fitLayoutToPage, computeSymbolScale, computeSymbolScaleFromLayout, getSheetFormat, layoutOptionsForSheet } from "./layout-engine.mjs";
export { SHEET_A1, SHEET_A3, SHEET_FORMATS } from "./sheet-sizes.mjs";
/** @deprecated use getSheetFormat('A1') */
export { SHEET_A3 as DRAWING_AREA } from "./sheet-sizes.mjs";

export const TAG_PREFIX_TYPE = {
  P: "pump",
  E: "heat_exchanger",
  T: "vessel",
  V: "vessel",
  R: "reactor",
  C: "column",
  D: "column",
  F: "vessel",
  K: "compressor",
};

const SYMBOL_ID_MAP = {
  pump: "PUMP-CENTRIFUGAL-001",
  heat_exchanger: "HEAT-EXCHANGER-001",
  vessel: "VESSEL-VERTICAL-001",
  reactor: "VESSEL-REACTOR-001",
  column: "COLUMN-DISTILLATION-001",
  compressor: "ROTARY-COMPRESSOR-001",
  generic: "GENERIC-001",
};

/** Deterministic UUID from project + class + tag */
export function stableObjectId(projectId, className, tag) {
  const hash = createHash("sha256")
    .update(`${projectId}|${className}|${tag}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export function inferEquipmentType(tag, explicitType = "") {
  if (explicitType) return explicitType;
  const prefix = (tag || "").split("-")[0]?.[0]?.toUpperCase() || "";
  return TAG_PREFIX_TYPE[prefix] || "generic";
}

export function inferSymbolId(equipmentType) {
  return SYMBOL_ID_MAP[equipmentType] || SYMBOL_ID_MAP.generic;
}

export function extractEquipmentTags(payload) {
  const tags = new Set();
  const pfdTags = payload.pfd?.equipment_tags || [];
  if (Array.isArray(pfdTags)) {
    for (const t of pfdTags) {
      if (typeof t === "string") tags.add(t);
      else if (t?.tag) tags.add(t.tag);
    }
  }
  for (const line of payload.line_list || []) {
    if (line.from) tags.add(line.from);
    if (line.to) tags.add(line.to);
    if (line.from_tag) tags.add(line.from_tag);
    if (line.to_tag) tags.add(line.to_tag);
  }
  return [...tags].filter(Boolean);
}

export function inferInstrumentType(tag = "") {
  const m = String(tag).match(/^([A-Z]{2,4})-/);
  return m ? m[1] : tag.slice(0, 3) || "TI";
}

export function collectControlLoops(payload) {
  const loops = payload.pid?.control_loops;
  if (Array.isArray(loops) && loops.length && typeof loops[0] === "object") return loops;
  if (Array.isArray(payload.main_control_loops)) return payload.main_control_loops;
  if (Array.isArray(payload.control_loops)) return payload.control_loops;
  return null;
}

export function buildInstrumentSpecs(payload) {
  const instruments = [];
  const loops = collectControlLoops(payload);

  if (Array.isArray(loops)) {
    for (const loop of loops) {
      if (typeof loop === "object") {
        const tag = loop.tag || loop.instrument || `TIC-${loop.loop_no || instruments.length + 1}`;
        instruments.push({
          tag,
          type: loop.type || inferInstrumentType(tag),
          loop: String(loop.loop_no || loop.loop || ""),
          on_line: loop.on_line || loop.line_no || "",
          range: loop.range || "",
          signal: loop.signal || "4-20mA",
        });
      }
    }
  } else if (typeof payload.pid?.control_loops === "number" && payload.pid.control_loops > 0) {
    const n = payload.pid.control_loops;
    const lineList = payload.line_list || [];
    for (let i = 1; i <= n; i++) {
      const line = lineList[(i - 1) % Math.max(lineList.length, 1)];
      instruments.push({
        tag: `TIC-${100 + i}`,
        type: "TIC",
        loop: String(i),
        signal: "4-20mA",
        on_line: line?.line_no || "",
        range: `${100 + i * 10}-${200 + i * 10}°C`,
      });
    }
  }

  const causeEffect = payload.cause_effect || payload.interlock_matrix || [];
  for (const ce of causeEffect) {
    const sensor = ce.sensor || ce.instrument;
    if (sensor && !instruments.find((i) => i.tag === sensor)) {
      instruments.push({
        tag: sensor,
        type: inferInstrumentType(sensor),
        loop: "",
        signal: "hardwired",
      });
    }
  }

  return instruments;
}

export function normalizeLines(lineList) {
  return (lineList || []).map((line, idx) => ({
    line_no: line.line_no || `L-${idx + 1}`,
    from_tag: line.from_tag || line.from || "",
    to_tag: line.to_tag || line.to || "",
    stream_no: line.stream_no || "",
    dn: line.dn ?? "",
    fluid: line.fluid || "",
    phase: line.phase || "",
    design_P_MPaG: line.design_P_MPaG,
    design_T_C: line.design_T_C,
    material: line.material || "",
    insulation: line.insulation || "",
  }));
}

function tagToObjectIdMap(objects) {
  const map = {};
  for (const obj of objects) {
    map[obj.tag] = obj.object_id;
  }
  return map;
}

function buildInlineValveObjects(lines, projectId, tagToId) {
  const valves = [];
  const valveTypesSeen = new Set();

  lines.forEach((line, idx) => {
    const valveType = inferValveType(idx);
    valveTypesSeen.add(valveType);
    const tag = valveTagForLine(line, idx);
    const objectId = stableObjectId(projectId, "Valve", tag);
    const pipeId = stableObjectId(projectId, "PipeRun", line.line_no);

    valves.push({
      object_id: objectId,
      class: "Valve",
      tag,
      attributes: {
        valve_type: valveType,
        fail_position: idx % 2 === 0 ? "FC" : "FO",
        on_line: line.line_no,
        line_no: line.line_no,
        from_tag: line.from_tag,
        to_tag: line.to_tag,
      },
      relationships: [
        { type: "mounted_on", role: "inline", target_id: pipeId },
      ],
      _pipe_line_no: line.line_no,
      _pipe_id: pipeId,
    });
  });

  return { valves, valveTypesSeen };
}

function buildSafetyValveObjects(safetyList, projectId, tagToId) {
  const list = Array.isArray(safetyList) ? safetyList : [];
  return list.map((sv) => {
    const tag = sv.tag || `PSV-${sv.protected_equipment || "UNK"}`;
    const objectId = stableObjectId(projectId, "SafetyValve", tag);
    const protectedId = tagToId[sv.protected_equipment] || null;
    const relationships = [];
    if (protectedId) {
      relationships.push({ type: "protects", target_id: protectedId, role: "equipment" });
    }
    return {
      object_id: objectId,
      class: "SafetyValve",
      tag,
      attributes: {
        set_P_MPaG: sv.set_P_MPaG ?? sv.setpoint ?? null,
        discharge: sv.discharge || "",
        protected_equipment: sv.protected_equipment || "",
        valve_type: sv.type || "PSV",
      },
      relationships,
      protected_equipment: sv.protected_equipment || "",
    };
  });
}

function buildControlLoopObjects(instrumentSpecs, valves, projectId, tagToId) {
  const valveByLine = {};
  for (const v of valves) {
    if (v.attributes?.on_line) valveByLine[v.attributes.on_line] = v;
  }

  const loops = [];
  const seen = new Set();

  for (const inst of instrumentSpecs) {
    if (!inst.loop || seen.has(inst.loop)) continue;
    seen.add(inst.loop);

    const loopTag = `LOOP-${inst.loop.padStart(3, "0")}`;
    const objectId = stableObjectId(projectId, "ControlLoop", loopTag);
    const instId = stableObjectId(projectId, "Instrument", inst.tag);
    const valve = inst.on_line ? valveByLine[inst.on_line] : null;
    const valveId = valve?.object_id || null;

    const relationships = [
      { type: "loop_member", role: "sensor", target_id: instId },
      { type: "loop_member", role: "controller", target_id: instId },
    ];
    if (valveId) {
      relationships.push({ type: "loop_member", role: "final_element", target_id: valveId });
    }

    loops.push({
      object_id: objectId,
      class: "ControlLoop",
      tag: loopTag,
      attributes: {
        loop_no: inst.loop,
        sensor_tag: inst.tag,
        controller_tag: inst.tag,
        final_element_tag: valve?.tag || "",
        signal_type: inst.signal || "4-20mA",
        range: inst.range || "",
        on_line: inst.on_line || "",
      },
      relationships,
      sensor_id: instId,
      controller_id: instId,
      final_element_id: valveId,
    });
  }

  return loops;
}

function attachInlineValvesToPipes(objects, valves) {
  const pipeByTag = {};
  for (const obj of objects) {
    if (obj.class === "PipeRun") pipeByTag[obj.tag] = obj;
  }
  for (const valve of valves) {
    const pipe = pipeByTag[valve.attributes?.on_line];
    if (!pipe) continue;
    pipe.relationships = pipe.relationships || [];
    pipe.relationships.push({
      type: "connected_by",
      role: "inline",
      target_id: valve.object_id,
    });
  }
}

const FOOTPRINT_MAP = {
  pump: [60, 35],
  valve: [20, 15],
  vessel: [45, 45],
  tank: [60, 60],
  heat_exchanger: [120, 40],
  reactor: [55, 55],
  column: [40, 40],
  compressor: [90, 50],
  generic: [50, 50],
};

function viewSuffix(projectId) {
  const m = String(projectId || "").match(/(\d+)\s*$/);
  return m ? m[1] : "100";
}

export function resolveViewId(projectId, drawingType) {
  const s = viewSuffix(projectId);
  const map = {
    pfd: `pfd-${s}-001`,
    pid: `pid-${s}-001`,
    layout: `layout-${s}-001`,
    isometric: `iso-${s}-001`,
    "3d": `model-3d-${s}-001`,
  };
  return map[drawingType] || map.pfd;
}

function enrichEquipmentViewAttributes(objects) {
  for (const obj of objects) {
    if (obj.class !== "Equipment") continue;
    const attrs = obj.attributes;
    const fp = FOOTPRINT_MAP[attrs.equipment_type] || FOOTPRINT_MAP.generic;
    if (attrs.footprint_x == null) attrs.footprint_x = fp[0];
    if (attrs.footprint_y == null) attrs.footprint_y = fp[1];
    if (attrs.elevation_mm == null) attrs.elevation_mm = 0;
    const d = Math.max(attrs.footprint_x, attrs.footprint_y);
    if (attrs.diameter_mm == null) attrs.diameter_mm = d;
    if (attrs.height_mm == null) attrs.height_mm = d * 2;
  }
}

function buildIsoTableRows(lines, tagPositions) {
  return lines.map((line) => {
    const fr = line.from_tag || "";
    const to = line.to_tag || "";
    const p1 = tagPositions[fr] || { z: 0 };
    const p2 = tagPositions[to] || { z: 0 };
    return {
      line_no: line.line_no,
      from_tag: fr,
      to_tag: to,
      dn: line.dn ?? "",
      elev_from: Math.round(p1.z ?? 0),
      elev_to: Math.round(p2.z ?? 0),
      medium: line.fluid || "",
      material: line.material || "",
    };
  });
}

function enrichEquipmentDesignConditions(objects, lines) {
  const eqByTag = {};
  const eqList = [];
  for (const obj of objects) {
    if (obj.class === "Equipment") {
      eqByTag[obj.tag] = obj;
      eqList.push(obj);
    }
  }
  for (const line of lines) {
    for (const tag of [line.from_tag, line.to_tag]) {
      const eq = eqByTag[tag];
      if (!eq) continue;
      const attrs = eq.attributes;
      if (line.design_P_MPaG != null && attrs.design_P_MPaG == null) {
        attrs.design_P_MPaG = line.design_P_MPaG;
      }
      if (line.design_T_C != null && attrs.design_T_C == null) {
        attrs.design_T_C = line.design_T_C;
      }
      if (attrs.oper_P_MPaG == null && line.design_P_MPaG != null) {
        attrs.oper_P_MPaG = Number((line.design_P_MPaG * 0.75).toFixed(2));
      }
      if (attrs.oper_T_C == null && line.design_T_C != null) {
        attrs.oper_T_C = Math.round(line.design_T_C * 0.85);
      }
    }
  }

  // Equipment without direct line connection — assign from nearest line in list
  for (let i = 0; i < eqList.length; i++) {
    const eq = eqList[i];
    const attrs = eq.attributes;
    const refLine = lines[i % Math.max(lines.length, 1)] || {};
    if (attrs.design_P_MPaG == null && refLine.design_P_MPaG != null) {
      attrs.design_P_MPaG = refLine.design_P_MPaG;
    }
    if (attrs.design_T_C == null && refLine.design_T_C != null) {
      attrs.design_T_C = refLine.design_T_C;
    }
    if (attrs.oper_P_MPaG == null && attrs.design_P_MPaG != null) {
      attrs.oper_P_MPaG = Number((attrs.design_P_MPaG * 0.75).toFixed(2));
    }
    if (attrs.oper_T_C == null && attrs.design_T_C != null) {
      attrs.oper_T_C = Math.round(attrs.design_T_C * 0.85);
    }
  }
}

/**
 * DisciplineOutput → PlantModel v1
 */
export function disciplineOutputToPlantModel(disciplineOutput, options = {}) {
  const payload = disciplineOutput.payload || {};
  const projectId = options.project_id || disciplineOutput.project_id || "VDI-PROJECT";
  const revision = options.revision || "A";

  const sheetSize = options.sheet_size || "A1";
  const tags = extractEquipmentTags(payload);
  const lines = normalizeLines(payload.line_list);
  const layoutOpts = { sheet: sheetSize, ...(options.layoutOptions || {}) };
  const positions = fitLayoutToPage(autoLayoutEquipment(tags, lines, layoutOpts), {
    sheet: sheetSize,
    ...(options.layoutFit || {}),
  });
  const instrumentSpecs = buildInstrumentSpecs(payload);

  const objects = [];
  const tagToId = {};

  for (const tag of tags) {
    const equipmentType = inferEquipmentType(tag);
    const objectId = stableObjectId(projectId, "Equipment", tag);
    tagToId[tag] = objectId;
    objects.push({
      object_id: objectId,
      class: "Equipment",
      tag,
      attributes: {
        equipment_type: equipmentType,
        symbol_id: inferSymbolId(equipmentType),
        design_P_MPaG: null,
        design_T_C: null,
        oper_P_MPaG: null,
        oper_T_C: null,
        material: "CS",
      },
      relationships: [],
    });
  }

  for (const line of lines) {
    const objectId = stableObjectId(projectId, "PipeRun", line.line_no);
    const fromId = tagToId[line.from_tag] || null;
    const toId = tagToId[line.to_tag] || null;
    const relationships = [];
    if (fromId && toId) {
      relationships.push({
        type: "connects",
        from_id: fromId,
        to_id: toId,
        from_port: "outlet",
        to_port: "inlet",
      });
    }
    objects.push({
      object_id: objectId,
      class: "PipeRun",
      tag: line.line_no,
      attributes: {
        dn: line.dn,
        fluid: line.fluid,
        phase: line.phase,
        design_P_MPaG: line.design_P_MPaG,
        design_T_C: line.design_T_C,
        material: line.material,
        insulation: line.insulation,
        from_tag: line.from_tag,
        to_tag: line.to_tag,
        stream_no: line.stream_no,
      },
      relationships,
    });
  }

  enrichEquipmentDesignConditions(objects, lines);
  enrichEquipmentViewAttributes(objects);

  for (const inst of instrumentSpecs) {
    const objectId = stableObjectId(projectId, "Instrument", inst.tag);
    objects.push({
      object_id: objectId,
      class: "Instrument",
      tag: inst.tag,
      attributes: {
        inst_type: inst.type,
        loop_id: inst.loop,
        range: inst.range,
        signal: inst.signal,
        on_line: inst.on_line,
      },
      relationships: inst.on_line
        ? [{ type: "mounted_on", role: "line", target_id: stableObjectId(projectId, "PipeRun", inst.on_line) }]
        : [],
    });
  }

  const { valves } = buildInlineValveObjects(lines, projectId, tagToId);
  for (const v of valves) {
    const { _pipe_line_no, _pipe_id, ...clean } = v;
    objects.push(clean);
  }
  attachInlineValvesToPipes(objects, valves);

  const safetyValveList = payload.safety_valve_list || payload.safety_valves || [];
  const safetyValveObjects = buildSafetyValveObjects(
    Array.isArray(safetyValveList) ? safetyValveList : [],
    projectId,
    tagToId
  );
  objects.push(...safetyValveObjects);

  const controlLoopObjects = buildControlLoopObjects(instrumentSpecs, valves, projectId, tagToId);
  objects.push(...controlLoopObjects);

  const pfd = payload.pfd || {};
  const pid = payload.pid || {};
  const suffix = viewSuffix(projectId);
  const pfdViewId = resolveViewId(projectId, "pfd");
  const pidViewId = resolveViewId(projectId, "pid");
  const layoutViewId = resolveViewId(projectId, "layout");
  const isoViewId = resolveViewId(projectId, "isometric");
  const model3dViewId = resolveViewId(projectId, "3d");

  const equipmentPlacements = {};
  const layoutPlacements = {};
  const tagPositions3d = {};
  for (const tag of tags) {
    const oid = tagToId[tag];
    const eq = objects.find((o) => o.tag === tag && o.class === "Equipment");
    const elev = eq?.attributes?.elevation_mm ?? 0;
    if (oid && positions[tag]) {
      equipmentPlacements[oid] = { ...positions[tag], rotation: 0 };
      layoutPlacements[oid] = { ...positions[tag], rotation: 0, z: elev };
      tagPositions3d[tag] = { ...positions[tag], z: elev };
    }
  }

  const lineByNo = Object.fromEntries(lines.map((l) => [l.line_no, l]));
  const pidExtraPlacements = computePidPlacements({
    equipmentPositions: Object.fromEntries(
      tags.filter((t) => positions[t]).map((t) => [t, positions[t]])
    ),
    lines,
    instruments: instrumentSpecs.map((inst) => ({
      ...inst,
      object_id: stableObjectId(projectId, "Instrument", inst.tag),
    })),
    valves: valves.map((v) => ({
      object_id: v.object_id,
      tag: v.tag,
      on_line: v.attributes.on_line,
      line_no: v.attributes.line_no,
    })),
    safetyValves: safetyValveObjects.map((sv) => ({
      object_id: sv.object_id,
      tag: sv.tag,
      protected_equipment: sv.protected_equipment,
    })),
    lineByNo,
  });

  const pidPlacements = { ...equipmentPlacements, ...pidExtraPlacements };

  const views = [
    {
      view_id: pfdViewId,
      view_type: "pfd",
      title_block: {
        drawing_number: pfd.drawing_number || "PFD-100-001",
        drawing_title: "工艺流程图",
        scale: options.scale || "1:100",
        revision,
      },
      placements: { ...equipmentPlacements },
    },
    {
      view_id: pidViewId,
      view_type: "pid",
      title_block: {
        drawing_number: pid.drawing_number || "PID-100-001",
        drawing_title: "管道仪表流程图",
        scale: options.scale || "1:100",
        revision,
      },
      placements: { ...pidPlacements },
    },
    {
      view_id: layoutViewId,
      view_type: "layout",
      title_block: {
        drawing_number: payload.layout?.drawing_number || `LAY-${suffix}-001`,
        drawing_title: "设备布置平面图",
        scale: options.scale || "1:100",
        revision,
      },
      placements: { ...layoutPlacements },
    },
    {
      view_id: isoViewId,
      view_type: "isometric",
      title_block: {
        drawing_number: payload.isometric?.drawing_number || `ISO-${suffix}-001`,
        drawing_title: "管道轴测图（简化单线）",
        scale: options.scale || "1:100",
        revision,
      },
      placements: { ...layoutPlacements },
    },
    {
      view_id: model3dViewId,
      view_type: "3d",
      title_block: {
        drawing_number: payload.model_3d?.drawing_number || `MODEL-3D-${suffix}-001`,
        drawing_title: "三维布置预览",
        scale: "N.T.S",
        revision,
      },
      placements: { ...layoutPlacements },
    },
  ];

  return {
    version: "1.0",
    project_id: projectId,
    revision,
    objects,
    views,
    change_log: [],
    _meta: {
      discipline: disciplineOutput.discipline || "process",
      citations: disciplineOutput.citations || [],
      tag_to_id: { ...tagToId, ...Object.fromEntries(valves.map((v) => [v.tag, v.object_id])) },
      lines,
      instrument_specs: instrumentSpecs,
      valve_specs: valves.map((v) => ({
        object_id: v.object_id,
        tag: v.tag,
        valve_type: v.attributes.valve_type,
        on_line: v.attributes.on_line,
      })),
      control_loops: controlLoopObjects,
      iso_table: buildIsoTableRows(lines, tagPositions3d),
      cause_effect: payload.cause_effect || payload.interlock_matrix || [],
      symbol_scale: computeSymbolScaleFromLayout(positions),
      safety_valves: Array.isArray(safetyValveList)
        ? safetyValveList
        : safetyValveObjects.map((sv) => ({
            tag: sv.tag,
            protected_equipment: sv.attributes.protected_equipment,
            set_P_MPaG: sv.attributes.set_P_MPaG,
            discharge: sv.attributes.discharge,
            object_id: sv.object_id,
          })),
    },
  };
}

/**
 * Merge PlantModel patches by object_id (upsert).
 */
export function mergePlantModel(base, patch) {
  const result = {
    version: patch.version || base.version || "1.0",
    project_id: patch.project_id || base.project_id,
    revision: patch.revision || base.revision || "A",
    objects: [...(base.objects || [])],
    views: [...(base.views || [])],
    change_log: [...(base.change_log || []), ...(patch.change_log || [])],
  };

  const byId = new Map(result.objects.map((o) => [o.object_id, o]));
  for (const obj of patch.objects || []) {
    byId.set(obj.object_id, { ...byId.get(obj.object_id), ...obj });
  }
  result.objects = [...byId.values()];

  const viewById = new Map(result.views.map((v) => [v.view_id, v]));
  for (const view of patch.views || []) {
    const existing = viewById.get(view.view_id);
    if (existing) {
      viewById.set(view.view_id, {
        ...existing,
        ...view,
        placements: { ...existing.placements, ...view.placements },
      });
    } else {
      viewById.set(view.view_id, view);
    }
  }
  result.views = [...viewById.values()];

  if (patch._meta || base._meta) {
    result._meta = { ...base._meta, ...patch._meta };
  }

  return result;
}

function buildStreamsFromLines(lines) {
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

/**
 * PlantModel → CadCommand v1 (view snapshot)
 */
export function plantModelToCadCommand(model, options = {}) {
  const drawingType = options.drawing_type || "pfd";
  const viewId = options.view_id || resolveViewId(model.project_id, drawingType);
  const view = (model.views || []).find((v) => v.view_id === viewId);
  const resolvedDrawingType = options.drawing_type || view?.view_type || drawingType;

  const meta = model._meta || {};
  const lines = meta.lines || [];
  const instrumentSpecs = meta.instrument_specs || buildInstrumentSpecs({ pid: { control_loops: [] } });
  const tagToId = meta.tag_to_id || tagToObjectIdMap(
    model.objects.filter((o) => o.class === "Equipment")
  );

  const equipmentObjects = model.objects.filter((o) => o.class === "Equipment");
  const pipeObjects = model.objects.filter((o) => o.class === "PipeRun");
  const instrumentObjects = model.objects.filter((o) => o.class === "Instrument");
  const valveObjects = model.objects.filter((o) => o.class === "Valve");
  const safetyValveObjects = model.objects.filter((o) => o.class === "SafetyValve");
  const controlLoopObjects = model.objects.filter((o) => o.class === "ControlLoop");

  const placements = view?.placements || {};

  const equipment = equipmentObjects.map((obj) => {
    const attrs = obj.attributes || {};
    const placement = placements[obj.object_id] || { x: 100, y: 200 };
    return {
      object_id: obj.object_id,
      tag: obj.tag,
      type: attrs.equipment_type || inferEquipmentType(obj.tag),
      symbol_id: attrs.symbol_id || inferSymbolId(attrs.equipment_type),
      position: {
        x: placement.x,
        y: placement.y,
        z: placement.z ?? attrs.elevation_mm ?? 0,
      },
      rotation: placement.rotation || 0,
      parameters: {
        design_P_MPaG: attrs.design_P_MPaG,
        design_T_C: attrs.design_T_C,
        oper_P_MPaG: attrs.oper_P_MPaG,
        oper_T_C: attrs.oper_T_C,
        material: attrs.material,
        symbol_id: attrs.symbol_id,
        footprint_x: attrs.footprint_x,
        footprint_y: attrs.footprint_y,
        elevation_mm: attrs.elevation_mm,
        height_mm: attrs.height_mm,
        diameter_mm: attrs.diameter_mm,
      },
    };
  });

  const lineSource = lines.length ? lines : pipeObjects.map((p) => ({
    line_no: p.tag,
    from_tag: p.attributes?.from_tag || "",
    to_tag: p.attributes?.to_tag || "",
    stream_no: p.attributes?.stream_no || "",
    dn: p.attributes?.dn,
    fluid: p.attributes?.fluid,
    phase: p.attributes?.phase,
    design_P_MPaG: p.attributes?.design_P_MPaG,
    design_T_C: p.attributes?.design_T_C,
    material: p.attributes?.material,
    insulation: p.attributes?.insulation,
  }));

  const cadLines = lineSource.map((line, idx) => {
    const pipeObj = pipeObjects.find((p) => p.tag === line.line_no);
    return {
      object_id: pipeObj?.object_id || stableObjectId(model.project_id, "PipeRun", line.line_no),
      line_no: line.line_no || `L-${idx + 1}`,
      from_tag: line.from_tag,
      to_tag: line.to_tag,
      stream_no: line.stream_no || "",
      dn: line.dn ?? "",
      fluid: line.fluid || "",
      phase: line.phase || "",
      design_P_MPaG: line.design_P_MPaG,
      design_T_C: line.design_T_C,
      material: line.material || "",
      insulation: line.insulation || "",
    };
  });

  const instSource = instrumentSpecs.length
    ? instrumentSpecs
    : instrumentObjects.map((o) => ({
        tag: o.tag,
        type: o.attributes?.inst_type,
        loop: o.attributes?.loop_id,
        on_line: o.attributes?.on_line,
        range: o.attributes?.range,
        signal: o.attributes?.signal,
      }));

  const instruments = instSource.map((inst) => {
    const instObj = instrumentObjects.find((o) => o.tag === inst.tag);
    const oid = instObj?.object_id || stableObjectId(model.project_id, "Instrument", inst.tag);
    const placement = placements[oid] || {};
    return {
      object_id: oid,
      tag: inst.tag,
      type: inst.type || inferInstrumentType(inst.tag),
      on_line: inst.on_line || "",
      loop: inst.loop || "",
      range: inst.range || "",
      signal: inst.signal || "",
      position: placement.x != null ? { x: placement.x, y: placement.y } : undefined,
    };
  });

  const valves = valveObjects.map((obj) => {
    const attrs = obj.attributes || {};
    const placement = placements[obj.object_id] || {};
    return {
      object_id: obj.object_id,
      tag: obj.tag,
      valve_type: attrs.valve_type || "gate",
      on_line: attrs.on_line || "",
      line_no: attrs.line_no || attrs.on_line || "",
      fail_position: attrs.fail_position || "",
      position: placement.x != null ? { x: placement.x, y: placement.y } : undefined,
    };
  });

  const safetyValves = (safetyValveObjects.length
    ? safetyValveObjects.map((obj) => {
        const attrs = obj.attributes || {};
        const placement = placements[obj.object_id] || {};
        return {
          object_id: obj.object_id,
          tag: obj.tag,
          type: attrs.valve_type || "PSV",
          protected_equipment: attrs.protected_equipment || "",
          set_P_MPaG: attrs.set_P_MPaG,
          discharge: attrs.discharge || "",
          position: placement.x != null ? { x: placement.x, y: placement.y } : undefined,
        };
      })
    : (meta.safety_valves || []).map((sv) => ({
        object_id: sv.object_id || stableObjectId(model.project_id, "SafetyValve", sv.tag),
        tag: sv.tag,
        type: sv.type || "PSV",
        protected_equipment: sv.protected_equipment || "",
        set_P_MPaG: sv.set_P_MPaG,
        discharge: sv.discharge || "",
      })));

  const controlLoops = (controlLoopObjects.length
    ? controlLoopObjects
    : meta.control_loops || []
  ).map((loop) => {
    const attrs = loop.attributes || loop;
    const rel = loop.relationships || [];
    const member = (role) => rel.find((r) => r.role === role)?.target_id;
    return {
      object_id: loop.object_id,
      tag: loop.tag,
      loop_no: attrs.loop_no || "",
      sensor_tag: attrs.sensor_tag || "",
      controller_tag: attrs.controller_tag || "",
      final_element_tag: attrs.final_element_tag || "",
      signal_type: attrs.signal_type || "4-20mA",
      range: attrs.range || "",
      on_line: attrs.on_line || "",
      sensor_id: loop.sensor_id || member("sensor"),
      controller_id: loop.controller_id || member("controller"),
      final_element_id: loop.final_element_id || member("final_element"),
    };
  });

  const idToPlacement = {};
  for (const [oid, pl] of Object.entries(placements)) {
    if (pl?.x != null) idToPlacement[oid] = { x: pl.x, y: pl.y };
  }
  const signalLines = controlLoops.flatMap((loop) => {
    const segments = [];
    const pick = (oid) => (oid && idToPlacement[oid] ? idToPlacement[oid] : null);
    const sensor = pick(loop.sensor_id);
    const controller = pick(loop.controller_id) || sensor;
    const finalEl = pick(loop.final_element_id);
    if (sensor && controller) {
      segments.push({
        loop_id: loop.object_id,
        loop_tag: loop.tag,
        from: sensor,
        to: controller,
        kind: "process",
        signal_type: loop.signal_type,
      });
    }
    if (controller && finalEl) {
      segments.push({
        loop_id: loop.object_id,
        loop_tag: loop.tag,
        from: controller,
        to: finalEl,
        kind: "signal",
        signal_type: loop.signal_type,
      });
    }
    return segments;
  });

  const pipeTableFromModel = pipeObjects.map((p) => {
    const attrs = p.attributes || {};
    return {
      object_id: p.object_id,
      line_no: p.tag,
      from_tag: attrs.from_tag || "",
      to_tag: attrs.to_tag || "",
      dn: attrs.dn ?? "",
      fluid: attrs.fluid || "",
      phase: attrs.phase || "",
      design_P_MPaG: attrs.design_P_MPaG,
      design_T_C: attrs.design_T_C,
      material: attrs.material || "",
      insulation: attrs.insulation || "",
      stream_no: attrs.stream_no || "",
    };
  });

  const titleBlock = {
    project_id: model.project_id,
    project_name: options.project_name || "甲醇装置",
    drawing_number:
      view?.title_block?.drawing_number ||
      ({
        pfd: "PFD-100-001",
        pid: "PID-100-001",
        layout: "LAY-100-001",
        isometric: "ISO-100-001",
        "3d": "MODEL-3D-100-001",
      }[resolvedDrawingType] || "VDI-001"),
    drawing_title:
      view?.title_block?.drawing_title ||
      ({
        pfd: "工艺流程图",
        pid: "管道仪表流程图",
        layout: "设备布置平面图",
        isometric: "管道轴测图",
        "3d": "三维布置预览",
      }[resolvedDrawingType] || "工艺流程图"),
    revision: model.revision || "A",
    discipline: meta.discipline || "process",
    scale: view?.title_block?.scale || (resolvedDrawingType === "3d" ? "N.T.S" : "1:100"),
    sheet_size: options.sheet_size || view?.title_block?.sheet_size || meta.sheet_size || "A1",
  };

  const basename = titleBlock.drawing_number.replace(/[^a-zA-Z0-9_-]/g, "_");
  const outputDir = options.output_directory || process.env.VDI_CAD_OUTPUT_DIR || "";

  const createSheet = options.create_sheet !== false;
  const exportObjectList = options.export_object_list !== false;
  const symbolScale =
    options.symbol_scale ??
    meta.symbol_scale ??
    computeSymbolScaleFromLayout(
      Object.fromEntries(
        equipment.filter((e) => e.position?.x != null).map((e) => [e.tag, e.position])
      ),
      28,
      10
    );

  return {
    version: "1.1",
    view_id: viewId,
    plant_model: model,
    drawing_type: resolvedDrawingType,
    options: {
      merge_mode: options.merge_mode !== false,
      create_sheet: createSheet,
      export_object_list: exportObjectList,
      strict_validation: options.strict_validation === true,
      symbol_scale: symbolScale,
      use_simple_symbols: options.use_simple_symbols !== false,
      sheet_size: titleBlock.sheet_size,
    },
    title_block: titleBlock,
    equipment,
    lines: cadLines,
    instruments,
    valves,
    safety_valves: safetyValves,
    control_loops: controlLoops,
    signal_lines: signalLines,
    streams: buildStreamsFromLines(lineSource),
    tables: {
      pipe_list: pipeTableFromModel.length ? pipeTableFromModel : cadLines,
      cause_effect: meta.cause_effect || [],
      safety_valves: safetyValves,
      equipment_list: equipment.map((e) => ({
        object_id: e.object_id,
        tag: e.tag,
        type: e.type,
        footprint_x: e.parameters?.footprint_x,
        footprint_y: e.parameters?.footprint_y,
        elevation_mm: e.parameters?.elevation_mm,
      })),
      iso_pipe_list: meta.iso_table || buildIsoTableRows(lineSource, {}),
    },
    citations: meta.citations || [],
    output: {
      directory: outputDir,
      formats:
        options.formats ||
        (resolvedDrawingType === "3d"
          ? ["FCStd", "STEP"]
          : createSheet
            ? ["FCStd", "DXF", "PDF"]
            : ["FCStd", "DXF"]),
      basename,
    },
  };
}
