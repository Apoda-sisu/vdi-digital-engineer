/**
 * CFIHOS handover JSON export from PlantModel v1.
 */

import { getCfihosMapping } from "./dexpi-export.mjs";

function mapObject(obj, classMapping) {
  const attrs = obj.attributes || {};
  const cfihos = {
    object_id: obj.object_id,
    tag: obj.tag,
    class: obj.class,
  };
  for (const [vdiKey, val] of Object.entries(attrs)) {
    if (val == null || val === "") continue;
    const map = classMapping[vdiKey];
    const key = map?.cfihos || vdiKey;
    cfihos[key] = val;
    if (map?.unit) cfihos[`${key}_unit`] = map.unit;
  }
  return cfihos;
}

/**
 * @param {object} model PlantModel v1
 */
export function plantModelToCfihosJson(model) {
  const mapping = getCfihosMapping();
  const objects = model.objects || [];
  const exportable = ["Equipment", "PipeRun", "Instrument", "Valve", "SafetyValve"];

  const handover = {
    schema: "CFIHOS-handover-v1",
    project_id: model.project_id,
    revision: model.revision,
    exported_at: new Date().toISOString(),
    objects: [],
  };

  for (const obj of objects) {
    if (!exportable.includes(obj.class)) continue;
    const classMapping = mapping.mappings?.[obj.class] || {};
    handover.objects.push(mapObject(obj, classMapping));
  }

  return handover;
}

export function cfihosExportSummary(model) {
  const json = plantModelToCfihosJson(model);
  const byClass = {};
  for (const o of json.objects) {
    byClass[o.class] = (byClass[o.class] || 0) + 1;
  }
  return {
    project_id: json.project_id,
    revision: json.revision,
    total: json.objects.length,
    by_class: byClass,
    format: "CFIHOS-handover-v1",
  };
}
