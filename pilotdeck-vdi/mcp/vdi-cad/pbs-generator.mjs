/**
 * Minimal PBS (Plant Breakdown Structure) for GB/T 51296 digital handover.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * @param {object} model PlantModel v1
 */
export function buildPbsJson(model) {
  const projectId = model.project_id || "VDI-PROJECT";
  const units = new Set();
  for (const obj of model.objects || []) {
    const unit = obj.attributes?.unit || obj.attributes?.area || "100";
    units.add(String(unit));
  }
  if (!units.size) units.add("100");

  const children = [...units].sort().map((unit) => ({
    node_id: `${projectId}-U${unit}`,
    node_type: "unit",
    name: `装置单元 ${unit}`,
    children: [
      {
        node_id: `${projectId}-U${unit}-PROC`,
        node_type: "discipline",
        name: "工艺",
        object_classes: ["Equipment", "PipeRun", "Instrument", "Valve", "SafetyValve", "Stream"],
      },
    ],
  }));

  return {
    version: "1.0",
    project_id: projectId,
    revision: model.revision || "A",
    standard: "GB/T 51296-2018",
    root: {
      node_id: projectId,
      node_type: "plant",
      name: projectId,
      children,
    },
  };
}

export function writePbsJson(model, outputPath) {
  const pbs = buildPbsJson(model);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(pbs, null, 2), "utf8");
  return { path: outputPath, pbs };
}
