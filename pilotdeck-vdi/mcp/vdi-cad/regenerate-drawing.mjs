/**
 * Phase 9c — apply PlantModel delta, write file, regenerate drawing via RPC.
 */

import path from "node:path";
import {
  readPlantModel,
  writePlantModel,
  publishPlantObjectChanged,
  publishDrawingGenerated,
  resolveProjectDir,
} from "./events.mjs";
import { applyPlantDelta } from "./revision-tracker.mjs";
import { plantModelToCadCommand } from "./plant-converter.mjs";
import { buildDrawingManifest } from "./manifest-export.mjs";
import * as cadClient from "./cad-client.mjs";
import fs from "node:fs";

/**
 * @param {object} options
 */
export async function regenerateDrawing(options) {
  const {
    project_id: projectId,
    delta = null,
    drawing_type: drawingType = "pfd",
    preview = true,
    publish_event: publishEvent = true,
  } = options;

  const loaded = readPlantModel(projectId);
  if (!loaded.found) {
    return { status: "error", message: loaded.error || "PlantModel not found" };
  }

  let model = loaded.model;
  let deltaResult = null;

  if (delta) {
    model = applyPlantDelta(model, {
      ...delta,
      bump_revision: delta.bump_revision ?? true,
      summary: delta.summary || "regenerate_drawing",
    });
    const writeResult = writePlantModel(projectId, model);
    deltaResult = { write: writeResult, revision: model.revision };

    if (publishEvent) {
      const changed =
        delta.objects?.map((o) => o.object_id).filter(Boolean) ||
        delta.updates?.map((u) => u.object_id).filter(Boolean) ||
        [];
      deltaResult.events = changed.map((oid) =>
        publishPlantObjectChanged({ project_id: projectId, object_id: oid, revision: model.revision })
      );
    }
  }

  const projectDir = resolveProjectDir(projectId);
  const outDir = path.join(projectDir, "cad-output");
  const view = model.views?.find((v) => v.view_type === drawingType) || model.views?.[0];
  const drawingNo =
    view?.title_block?.drawing_number ||
    (preview ? "PFD-100-001-PREVIEW" : "PFD-100-001");

  const cadCommand = plantModelToCadCommand(model, {
    drawing_type: drawingType,
    project_id: projectId,
    output_directory: outDir,
    formats: ["FCStd", "PDF", "DXF"],
    create_sheet: true,
    sheet_size: view?.title_block?.sheet_size || "A1",
  });
  cadCommand.plant_model = model;
  cadCommand.options = {
    ...cadCommand.options,
    merge_mode: false,
    fresh_document: true,
    create_sheet: true,
    use_simple_symbols: true,
    hide_model_space: true,
  };
  cadCommand.output.basename = drawingNo.replace(/[^a-zA-Z0-9_-]/g, "_");

  const conn = await cadClient.checkConnection();
  if (!conn.connected) {
    return {
      status: "partial",
      message: "PlantModel updated but FreeCAD RPC offline",
      delta: deltaResult,
      plant_model: model,
    };
  }

  const rpcResult = await cadClient.execute(cadCommand);

  const manifest = buildDrawingManifest(model, {
    drawing_number: drawingNo,
    view_id: view?.view_id,
    sheet_size: cadCommand.options?.sheet_size || "A1",
    symbol_scale: cadCommand.options?.symbol_scale || 1.0,
    files: Object.fromEntries(
      (rpcResult.exported || []).map((e) => [e.format?.toLowerCase(), e.path])
    ),
  });
  const manifestPath = path.join(outDir, `${cadCommand.output.basename}-manifest.json`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  let drawEvent = null;
  if (publishEvent && rpcResult?.status === "success") {
    drawEvent = publishDrawingGenerated({
      project_id: projectId,
      payload: {
        drawing_type: drawingType,
        drawing_number: drawingNo,
        regenerated: true,
        exported: rpcResult.exported || [],
      },
    });
  }

  return {
    status: rpcResult.status === "success" ? "success" : "error",
    delta: deltaResult,
    rpc_result: rpcResult,
    manifest_path: manifestPath,
    drawing_event: drawEvent,
  };
}
