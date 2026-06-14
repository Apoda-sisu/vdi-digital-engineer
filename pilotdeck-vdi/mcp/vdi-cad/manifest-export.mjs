/**
 * Build drawing-manifest.json for Web/MCP pick resolution.
 */

import { getSheetFormat } from "./sheet-sizes.mjs";

/**
 * @param {object} plantModel
 * @param {object} options
 */
export function buildDrawingManifest(plantModel, options = {}) {
  const {
    drawing_number = "PFD-UNKNOWN",
    view_id = null,
    sheet_size = "A1",
    symbol_scale = 1.0,
    fit_scale = 1.0,
  } = options;

  const views = plantModel.views || [];
  const view =
    views.find((v) => v.view_id === view_id) ||
    views.find((v) => v.view_type === "pfd") ||
    views[0] ||
    {};

  const vid = view.view_id || view_id || "pfd-default";
  const sheet = getSheetFormat(sheet_size);
  const halfW = sheet.symbolHalfW * symbol_scale;
  const halfH = sheet.symbolHalfH * symbol_scale;
  const placements = view.placements || {};
  const index = new Map((plantModel.objects || []).map((o) => [o.object_id, o]));

  const objects = [];
  for (const [oid, pl] of Object.entries(placements)) {
    const plantObj = index.get(oid);
    if (!plantObj) continue;
    const x = Number(pl.x) || 0;
    const y = Number(pl.y) || 0;
    const w = halfW * 2;
    const h = halfH * 2;
    const bx = x - halfW;
    const by = y - halfH;
    objects.push({
      object_id: oid,
      tag: plantObj.tag,
      class: plantObj.class,
      bbox_mm: { x: bx, y: by, w, h },
      bbox_view: {
        x: bx / sheet.width,
        y: by / sheet.height,
        w: w / sheet.width,
        h: h / sheet.height,
      },
    });
  }

  return {
    version: "1.0",
    drawing_number,
    view_id: vid,
    sheet_size,
    scale: fit_scale,
    symbol_scale,
    sheet_mm: { width: sheet.width, height: sheet.height },
    objects,
    files: options.files || {},
  };
}

/**
 * Hit test normalized view coordinates (0–1) against manifest objects.
 */
export function resolvePickFromManifest(manifest, x, y) {
  const nx = Number(x);
  const ny = Number(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
    return { status: "error", message: "x and y must be numbers in 0–1 range" };
  }

  for (const obj of manifest.objects || []) {
    const b = obj.bbox_view;
    if (!b) continue;
    if (nx >= b.x && nx <= b.x + b.w && ny >= b.y && ny <= b.y + b.h) {
      return { status: "hit", object_id: obj.object_id, tag: obj.tag, class: obj.class, method: "bbox_view" };
    }
  }
  return { status: "miss", message: "No object at coordinates" };
}

export function manifestPathForDrawing(projectDir, drawingNumber) {
  const safe = String(drawingNumber).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${projectDir}/cad-output/${safe}-manifest.json`;
}
