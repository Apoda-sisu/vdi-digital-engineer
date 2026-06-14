/**
 * PlantModel object lookup — file-based, no FreeCAD required.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPlantModel, resolveProjectDir } from "./events.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _fieldTemplates = null;

export function loadFieldTemplates() {
  if (_fieldTemplates) return _fieldTemplates;
  const p = path.join(
    __dirname,
    "../../freecad/vdi_cad_addon/vdi_cad_core/object_field_templates.json"
  );
  _fieldTemplates = JSON.parse(fs.readFileSync(p, "utf8"));
  return _fieldTemplates;
}

export function formatPlantObject(plantObj) {
  const templates = loadFieldTemplates();
  const className = plantObj.class || "Equipment";
  const classMeta = templates.classes?.[className] || {};
  const classLabel = classMeta.label || className;
  const attrs = plantObj.attributes || {};
  const fieldDefs = [...(classMeta.fields || [])].sort((a, b) => (a.order || 99) - (b.order || 99));

  const fields = [];
  const seen = new Set();
  for (const fd of fieldDefs) {
    const val = attrs[fd.key];
    if (val == null || val === "") continue;
    const unit = fd.unit || "";
    fields.push({
      key: fd.key,
      label: fd.label || fd.key,
      value: val,
      display: unit ? `${val} ${unit}`.trim() : String(val),
      unit,
    });
    seen.add(fd.key);
  }
  for (const [key, val] of Object.entries(attrs)) {
    if (seen.has(key) || val == null || val === "" || key.startsWith("_")) continue;
    fields.push({ key, label: key, value: val, display: String(val), unit: "" });
  }

  return {
    object_id: plantObj.object_id,
    tag: plantObj.tag,
    class: className,
    class_label: classLabel,
    fields,
    relationships: plantObj.relationships || [],
  };
}

export function getObjectFromModel(model, objectId, { includeRelationships = true } = {}) {
  const obj = (model.objects || []).find((o) => o.object_id === objectId);
  if (!obj) return null;
  const result = { ...obj };
  if (!includeRelationships) delete result.relationships;
  return result;
}

export function getObjectByTag(model, tag) {
  return (model.objects || []).find((o) => o.tag === tag) || null;
}

export function getObjectFromProject(projectId, objectId, options = {}) {
  const loaded = readPlantModel(projectId);
  if (!loaded.found) {
    return { status: "error", message: loaded.error || "PlantModel not found" };
  }
  const obj = getObjectFromModel(loaded.model, objectId, options);
  if (!obj) {
    return { status: "error", message: `object_id not found: ${objectId}` };
  }
  return {
    status: "success",
    source: loaded.path,
    object: obj,
    formatted: formatPlantObject(obj),
    project_id: loaded.model.project_id,
    revision: loaded.model.revision,
  };
}

export { resolveProjectDir };
