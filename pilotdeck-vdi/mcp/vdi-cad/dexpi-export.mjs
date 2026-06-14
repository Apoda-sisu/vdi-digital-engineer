/**
 * DEXPI Proteus XML subset export from PlantModel v1.
 * Covers: Equipment, PipeRun (PipingNetworkSegment), Instrument, Valve, SafetyValve.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEXPI_NS = "http://www.dexpi.org/PlantModel/1.4";
const RDL = "http://data.posccaesar.org/rdl";

const EQUIPMENT_CLASS = {
  pump: { cls: "CentrifugalPump", uri: `${RDL}/RDS416937` },
  vessel: { cls: "Vessel", uri: `${RDL}/RDS414674` },
  tank: { cls: "Tank", uri: `${RDL}/RDS414674` },
  reactor: { cls: "Vessel", uri: `${RDL}/RDS414674` },
  column: { cls: "Column", uri: `${RDL}/RDS415842` },
  heat_exchanger: { cls: "ShellAndTubeHeatExchanger", uri: `${RDL}/RDS416321` },
  compressor: { cls: "Compressor", uri: `${RDL}/RDS415842` },
  generic: { cls: "Equipment", uri: `${RDL}/RDS414674` },
};

const VALVE_CLASS = {
  gate: { cls: "GateValve", uri: `${RDL}/RDS416842` },
  ball: { cls: "BallValve", uri: `${RDL}/RDS416842` },
  check: { cls: "CheckValve", uri: `${RDL}/RDS416842` },
};

function xmlEscape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function dexpiId(objectId, prefix = "obj") {
  const clean = String(objectId || "").replace(/[^a-zA-Z0-9]/g, "");
  return `${prefix}_${clean.slice(0, 32) || "unknown"}`;
}

function nozzleId(equipmentId, role) {
  return `${dexpiId(equipmentId, "eq")}_nozzle_${role}`;
}

function genericAttributes(attrs, mapping) {
  const entries = [];
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val == null || val === "") continue;
    const map = mapping?.[key];
    const name = map?.dexpi || key;
    const format = map?.unit || "";
    entries.push(
      `      <GenericAttribute Name="${xmlEscape(name)}" Value="${xmlEscape(val)}"${
        format ? ` Format="${xmlEscape(format)}"` : ""
      }/>`
    );
  }
  if (!entries.length) return "";
  return `    <GenericAttributes Number="${entries.length}">\n${entries.join("\n")}\n    </GenericAttributes>`;
}

let _mappingCache = null;

export function getCfihosMapping() {
  if (!_mappingCache) {
    _mappingCache = JSON.parse(
      fs.readFileSync(path.join(__dirname, "schemas/cfihos-vdi-mapping.json"), "utf8")
    );
  }
  return _mappingCache;
}

/**
 * @param {object} model PlantModel v1
 * @param {{ discipline?: string }} options
 */
export function plantModelToDexpiXml(model, options = {}) {
  const mapping = getCfihosMapping();
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8);
  const discipline = options.discipline || "PID";
  const revision = model.revision || "A";
  const projectId = model.project_id || "VDI-PROJECT";

  const equipment = (model.objects || []).filter((o) => o.class === "Equipment");
  const pipes = (model.objects || []).filter((o) => o.class === "PipeRun");
  const instruments = (model.objects || []).filter((o) => o.class === "Instrument");
  const valves = (model.objects || []).filter((o) => o.class === "Valve");
  const psvs = (model.objects || []).filter((o) => o.class === "SafetyValve");
  const streams = (model.objects || []).filter((o) => o.class === "Stream");

  const eqMap = mapping.mappings?.Equipment || {};
  const pipeMap = mapping.mappings?.PipeRun || {};
  const instMap = mapping.mappings?.Instrument || {};
  const valveMap = mapping.mappings?.Valve || {};
  const psvMap = mapping.mappings?.SafetyValve || {};

  const parts = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>');
  parts.push(`<PlantModel xmlns="${DEXPI_NS}">`);
  parts.push(`  <PlantInformation`);
  parts.push(`    OriginatingSystem="PilotDeck-VDI"`);
  parts.push(`    OriginatingSystemVersion="1.0"`);
  parts.push(`    OriginatingSystemVendor="PilotDeck"`);
  parts.push(`    Date="${date}"`);
  parts.push(`    Time="${time}"`);
  parts.push(`    Is3D="no"`);
  parts.push(`    Discipline="${xmlEscape(discipline)}"`);
  parts.push(`    SchemaVersion="4.2.0">`);
  parts.push(`    <UnitsOfMeasure Distance="Millimetre" Pressure="MPa" Temperature="DegreeCelsius"/>`);
  parts.push(`    <GenericAttributes Number="2">`);
  parts.push(`      <GenericAttribute Name="ProjectId" Value="${xmlEscape(projectId)}"/>`);
  parts.push(`      <GenericAttribute Name="Revision" Value="${xmlEscape(revision)}"/>`);
  parts.push(`    </GenericAttributes>`);
  parts.push(`  </PlantInformation>`);

  for (const eq of equipment) {
    const attrs = eq.attributes || {};
    const et = (attrs.equipment_type || "generic").toLowerCase();
    const meta = EQUIPMENT_CLASS[et] || EQUIPMENT_CLASS.generic;
    const eid = dexpiId(eq.object_id, "eq");
    parts.push(`  <Equipment`);
    parts.push(`    ID="${eid}"`);
    parts.push(`    TagName="${xmlEscape(eq.tag)}"`);
    parts.push(`    ComponentClass="${meta.cls}"`);
    parts.push(`    ComponentClassURI="${meta.uri}">`);
    const ga = genericAttributes(attrs, eqMap);
    if (ga) parts.push(ga);
    parts.push(`    <Nozzle ID="${nozzleId(eq.object_id, "in")}" TagName="N1" ComponentClass="Nozzle" ComponentClassURI="${RDL}/RDS415214"/>`);
    parts.push(`    <Nozzle ID="${nozzleId(eq.object_id, "out")}" TagName="N2" ComponentClass="Nozzle" ComponentClassURI="${RDL}/RDS415214"/>`);
    parts.push(`  </Equipment>`);
  }

  if (pipes.length) {
    parts.push(`  <PipingNetworkSystem`);
    parts.push(`    ID="pns_main"`);
    parts.push(`    TagName="${xmlEscape(projectId)}-Piping"`);
    parts.push(`    ComponentClass="PipingNetworkSystem"`);
    parts.push(`    ComponentClassURI="${RDL}/RDS270359">`);

    for (const pipe of pipes) {
      const attrs = pipe.attributes || {};
      const segId = dexpiId(pipe.object_id, "seg");
      const fromTag = attrs.from_tag || "";
      const toTag = attrs.to_tag || "";
      const fromEq = equipment.find((e) => e.tag === fromTag);
      const toEq = equipment.find((e) => e.tag === toTag);
      parts.push(`    <PipingNetworkSegment`);
      parts.push(`      ID="${segId}"`);
      parts.push(`      TagName="${xmlEscape(pipe.tag)}"`);
      parts.push(`      ComponentClass="PipingNetworkSegment"`);
      parts.push(`      ComponentClassURI="${RDL}/RDS267704">`);
      const ga = genericAttributes(attrs, pipeMap);
      if (ga) parts.push(ga.replace(/^    /gm, "      "));
      if (fromEq) {
        parts.push(`      <Connection FromID="${nozzleId(fromEq.object_id, "out")}" ToID="${segId}_start"/>`);
      }
      if (toEq) {
        parts.push(`      <Connection FromID="${segId}_end" ToID="${nozzleId(toEq.object_id, "in")}"/>`);
      }
      parts.push(`    </PipingNetworkSegment>`);
    }
    parts.push(`  </PipingNetworkSystem>`);
  }

  for (const inst of instruments) {
    const iid = dexpiId(inst.object_id, "inst");
    parts.push(`  <InstrumentationLoopFunction`);
    parts.push(`    ID="${iid}"`);
    parts.push(`    TagName="${xmlEscape(inst.tag)}"`);
    parts.push(`    ComponentClass="ProcessInstrumentationFunction"`);
    parts.push(`    ComponentClassURI="${RDL}/RDS416842">`);
    const ga = genericAttributes(inst.attributes, instMap);
    if (ga) parts.push(ga);
    parts.push(`  </InstrumentationLoopFunction>`);
  }

  for (const valve of valves) {
    const vt = (valve.attributes?.valve_type || "gate").toLowerCase();
    const vmeta = VALVE_CLASS[vt] || VALVE_CLASS.gate;
    const vid = dexpiId(valve.object_id, "valve");
    parts.push(`  <OperatedValve`);
    parts.push(`    ID="${vid}"`);
    parts.push(`    TagName="${xmlEscape(valve.tag)}"`);
    parts.push(`    ComponentClass="${vmeta.cls}"`);
    parts.push(`    ComponentClassURI="${vmeta.uri}">`);
    const ga = genericAttributes(valve.attributes, valveMap);
    if (ga) parts.push(ga);
    parts.push(`  </OperatedValve>`);
  }

  for (const psv of psvs) {
    const pid = dexpiId(psv.object_id, "psv");
    parts.push(`  <SafetyValveOrFitting`);
    parts.push(`    ID="${pid}"`);
    parts.push(`    TagName="${xmlEscape(psv.tag)}"`);
    parts.push(`    ComponentClass="SafetyValve"`);
    parts.push(`    ComponentClassURI="${RDL}/RDS416842">`);
    const ga = genericAttributes(psv.attributes, psvMap);
    if (ga) parts.push(ga);
    parts.push(`  </SafetyValveOrFitting>`);
  }

  if (discipline === "PFD" && streams.length) {
    for (const stream of streams) {
      const sid = dexpiId(stream.object_id, "str");
      parts.push(`  <ProcessConnection`);
      parts.push(`    ID="${sid}"`);
      parts.push(`    TagName="${xmlEscape(stream.tag)}"`);
      parts.push(`    ComponentClass="ProcessConnection"`);
      parts.push(`    ComponentClassURI="${RDL}/RDS414674">`);
      const ga = genericAttributes(stream.attributes, {});
      if (ga) parts.push(ga);
      parts.push(`  </ProcessConnection>`);
    }
  }

  parts.push(`</PlantModel>`);
  return parts.join("\n");
}

export function dexpiExportSummary(model) {
  const objects = model.objects || [];
  return {
    project_id: model.project_id,
    revision: model.revision,
    equipment: objects.filter((o) => o.class === "Equipment").length,
    pipe_segments: objects.filter((o) => o.class === "PipeRun").length,
    instruments: objects.filter((o) => o.class === "Instrument").length,
    valves: objects.filter((o) => o.class === "Valve").length,
    safety_valves: objects.filter((o) => o.class === "SafetyValve").length,
    streams: objects.filter((o) => o.class === "Stream").length,
    format: "DEXPI-Proteus-subset-1.4",
  };
}
