/**
 * Export PlantModel objects to CSV object list (equipment design conditions + GB/T 51296).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _classMap = null;

export function loadGbt51296ClassMap() {
  if (_classMap) return _classMap;
  _classMap = JSON.parse(
    fs.readFileSync(path.join(__dirname, "schemas/gbt51296-class-map.json"), "utf8")
  );
  return _classMap;
}

export function resolveGbt51296Class(obj) {
  const map = loadGbt51296ClassMap();
  const className = obj.class || "Equipment";
  const classEntry = map.mappings?.[className] || {};
  if (className === "Equipment") {
    const et = (obj.attributes?.equipment_type || "generic").toLowerCase();
    const byType = classEntry.by_equipment_type?.[et] || classEntry.default;
    return byType || { class_code: "EQP", class_name: "设备" };
  }
  return classEntry.default || { class_code: className, class_name: className };
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values) {
  return values.map(csvEscape).join(",");
}

/**
 * @param {object} model PlantModel v1
 * @param {{ pbs_node?: string }} options
 * @returns {string} CSV content
 */
export function plantModelToObjectListCsv(model, options = {}) {
  const defaultPbs = options.pbs_node || model.project_id || "";
  const lines = [];
  lines.push(
    row([
      "object_id",
      "class",
      "tag",
      "gbt51296_class_code",
      "gbt51296_class_name",
      "pbs_node",
      "equipment_type",
      "design_P_MPaG",
      "design_T_C",
      "oper_P_MPaG",
      "oper_T_C",
      "material",
      "dn",
      "fluid",
      "inst_type",
      "loop_id",
      "valve_type",
      "set_P_MPaG",
    ])
  );

  for (const obj of model.objects || []) {
    const a = obj.attributes || {};
    const gbt = resolveGbt51296Class(obj);
    lines.push(
      row([
        obj.object_id,
        obj.class,
        obj.tag,
        gbt.class_code,
        gbt.class_name,
        a.pbs_node || defaultPbs,
        a.equipment_type || "",
        a.design_P_MPaG ?? "",
        a.design_T_C ?? "",
        a.oper_P_MPaG ?? "",
        a.oper_T_C ?? "",
        a.material || "",
        a.dn ?? "",
        a.fluid || "",
        a.inst_type || "",
        a.loop_id || "",
        a.valve_type || "",
        a.set_P_MPaG ?? "",
      ])
    );
  }

  return `${lines.join("\n")}\n`;
}

export function equipmentDesignSummary(model) {
  const equipment = (model.objects || []).filter((o) => o.class === "Equipment");
  const withP = equipment.filter((o) => o.attributes?.design_P_MPaG != null);
  const withT = equipment.filter((o) => o.attributes?.design_T_C != null);
  return {
    total: equipment.length,
    with_design_P: withP.length,
    with_design_T: withT.length,
    complete: withP.length === equipment.length && withT.length === equipment.length,
  };
}
