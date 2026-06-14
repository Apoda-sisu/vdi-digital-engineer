/**
 * DEXPI XML import (read-only POC) — PlantModel draft from Proteus subset.
 */

/**
 * @param {string} xml
 * @returns {object} PlantModel draft
 */
export function dexpiXmlToPlantModelDraft(xml) {
  const objects = [];

  const equipRe = /<Equipment[^>]*TagName="([^"]*)"[^>]*>/g;
  let m;
  while ((m = equipRe.exec(xml)) !== null) {
    objects.push({
      object_id: cryptoRandomId(),
      class: "Equipment",
      tag: m[1],
      attributes: {},
      relationships: [],
      source: "dexpi_import",
    });
  }

  const segRe = /<PipingNetworkSegment[^>]*TagName="([^"]*)"[^>]*>/g;
  while ((m = segRe.exec(xml)) !== null) {
    objects.push({
      object_id: cryptoRandomId(),
      class: "PipeRun",
      tag: m[1],
      attributes: {},
      relationships: [],
      source: "dexpi_import",
    });
  }

  const instRe = /<InstrumentationLoopFunction[^>]*TagName="([^"]*)"[^>]*>/g;
  while ((m = instRe.exec(xml)) !== null) {
    objects.push({
      object_id: cryptoRandomId(),
      class: "Instrument",
      tag: m[1],
      attributes: {},
      relationships: [],
      source: "dexpi_import",
    });
  }

  const valveRe = /<OperatedValve[^>]*TagName="([^"]*)"[^>]*>/g;
  while ((m = valveRe.exec(xml)) !== null) {
    objects.push({
      object_id: cryptoRandomId(),
      class: "Valve",
      tag: m[1],
      attributes: {},
      relationships: [],
      source: "dexpi_import",
    });
  }

  const psvRe = /<SafetyValveOrFitting[^>]*TagName="([^"]*)"[^>]*>/g;
  while ((m = psvRe.exec(xml)) !== null) {
    objects.push({
      object_id: cryptoRandomId(),
      class: "SafetyValve",
      tag: m[1],
      attributes: {},
      relationships: [],
      source: "dexpi_import",
    });
  }

  const projectMatch = xml.match(/Name="ProjectId" Value="([^"]*)"/);
  const revMatch = xml.match(/Name="Revision" Value="([^"]*)"/);

  return {
    version: "1.0",
    project_id: projectMatch?.[1] || "DEXPI-IMPORT",
    revision: revMatch?.[1] || "A",
    objects,
    views: [],
    change_log: [],
    source: "dexpi_import",
  };
}

function cryptoRandomId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function dexpiImportSummary(draft) {
  const objects = draft.objects || [];
  return {
    total: objects.length,
    equipment: objects.filter((o) => o.class === "Equipment").length,
    pipe_runs: objects.filter((o) => o.class === "PipeRun").length,
    instruments: objects.filter((o) => o.class === "Instrument").length,
    valves: objects.filter((o) => o.class === "Valve").length,
    safety_valves: objects.filter((o) => o.class === "SafetyValve").length,
  };
}
