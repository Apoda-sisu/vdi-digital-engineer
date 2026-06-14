#!/usr/bin/env node
/**
 * Phase 10c — Digital handover pack (GB/T 51296 + DEXPI + manifests).
 *
 *   node digital-handover-pack.mjs --project MEOH-100
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPlantModel, resolveProjectDir } from "./events.mjs";
import { plantModelToObjectListCsv } from "./plant-object-export.mjs";
import { plantModelToDexpiXml, dexpiExportSummary } from "./dexpi-export.mjs";
import { buildPbsJson } from "./pbs-generator.mjs";
import { buildDrawingManifest } from "./manifest-export.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const projectId = process.argv.includes("--project")
  ? process.argv[process.argv.indexOf("--project") + 1]
  : "MEOH-100";

const loaded = readPlantModel(projectId);
if (!loaded.found) {
  console.error("PlantModel not found:", loaded.error);
  process.exit(1);
}

const model = loaded.model;
const projectDir = resolveProjectDir(projectId);
const handoverDir = path.join(projectDir, "handover");

const dirs = [
  handoverDir,
  path.join(handoverDir, "plant"),
  path.join(handoverDir, "dexpi"),
  path.join(handoverDir, "drawings"),
  path.join(handoverDir, "manifests"),
  path.join(handoverDir, "tables"),
];

for (const d of dirs) fs.mkdirSync(d, { recursive: true });

fs.copyFileSync(loaded.path, path.join(handoverDir, "plant/model.json"));

const pbs = buildPbsJson(model);
fs.writeFileSync(path.join(handoverDir, "plant/pbs.json"), JSON.stringify(pbs, null, 2));

const pfdView = model.views?.find((v) => v.view_type === "pfd");
const pidView = model.views?.find((v) => v.view_type === "pid");

const pfdXml = plantModelToDexpiXml(model, { discipline: "PFD" });
fs.writeFileSync(path.join(handoverDir, "dexpi/PFD-dexpi.xml"), pfdXml, "utf8");

const pidXml = plantModelToDexpiXml(model, { discipline: "PID" });
fs.writeFileSync(path.join(handoverDir, "dexpi/PID-dexpi.xml"), pidXml, "utf8");

const objectCsv = plantModelToObjectListCsv(model, { pbs_node: projectId });
fs.writeFileSync(path.join(handoverDir, "tables/object-register.csv"), objectCsv, "utf8");

const equipCsv = plantModelToObjectListCsv(
  { ...model, objects: (model.objects || []).filter((o) => o.class === "Equipment") },
  { pbs_node: projectId }
);
fs.writeFileSync(path.join(handoverDir, "tables/equipment-list.csv"), equipCsv, "utf8");

const cadOut = path.join(projectDir, "cad-output");
if (fs.existsSync(cadOut)) {
  for (const f of fs.readdirSync(cadOut)) {
    if (/\.(FCStd|PDF|DXF|svg)$/i.test(f) && !f.includes(".FCBak")) {
      fs.copyFileSync(path.join(cadOut, f), path.join(handoverDir, "drawings", f));
    }
    if (f.endsWith("-manifest.json")) {
      fs.copyFileSync(path.join(cadOut, f), path.join(handoverDir, "manifests", f));
    }
  }
}

if (!fs.existsSync(path.join(handoverDir, "manifests")) || !fs.readdirSync(path.join(handoverDir, "manifests")).length) {
  const manifest = buildDrawingManifest(model, {
    drawing_number: pfdView?.title_block?.drawing_number || "PFD-100-001-PREVIEW",
    view_id: pfdView?.view_id,
    sheet_size: pfdView?.title_block?.sheet_size || "A1",
  });
  fs.writeFileSync(
    path.join(handoverDir, "manifests/drawing-manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
}

const readme = `# Digital Handover Pack — ${projectId}

Generated: ${new Date().toISOString()}
Standard: GB/T 51296-2018 + DEXPI 1.4 subset

## Contents

- plant/model.json — PlantModel 真源
- plant/pbs.json — 工厂分解结构
- dexpi/*.xml — DEXPI 交换文件
- drawings/* — FCStd/PDF/DXF
- manifests/* — 图面点选索引
- tables/object-register.csv — 对象清单（含 51296 类码）
`;

fs.writeFileSync(path.join(handoverDir, "README-handover.md"), readme, "utf8");

const summary = {
  status: "success",
  project_id: projectId,
  handover_dir: handoverDir,
  objects: model.objects?.length || 0,
  dexpi: dexpiExportSummary(model),
  files: fs.readdirSync(handoverDir, { recursive: true }).filter((f) => !String(f).includes(".DS_Store")),
};

console.log(JSON.stringify(summary, null, 2));
