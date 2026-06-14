#!/usr/bin/env node
/**
 * CP-1 — MEOH-100 PFD 可交付出图
 *
 * 默认 preview（12 台设备，符号可读）；--full 为 48 台概览。
 * 成果物：PDF（首选）+ FCStd + DXF，写入 cad-output/
 *
 *   node run-pfd-cp1.mjs           # preview，推荐人工验收
 *   node run-pfd-cp1.mjs --full    # 全装置概览（符号较小）
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MEOH_PILOT, MEOH_PROJECT_ID, WORKSPACE_ROOT } from "../../config/pilot-paths.mjs";
import {
  disciplineOutputToPlantModel,
  plantModelToCadCommand,
  buildMethanolFixture,
} from "./converter.mjs";
import * as cadClient from "./cad-client.mjs";
import { publishDrawingGenerated, writePlantModel } from "./events.mjs";
import { buildDrawingManifest } from "./manifest-export.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testData = JSON.parse(
  readFileSync(path.join(MEOH_PILOT, "test-inputs/pid-01-must-data.json"), "utf8")
);

const full = process.argv.includes("--full");
const preview = !full;
const SHEET_SIZE = "A1";
const fixture = buildMethanolFixture();

const disciplineOutput = {
  discipline: "process",
  output_type: "pfd",
  project_id: MEOH_PROJECT_ID,
  payload: {
    pfd: {
      drawing_number: preview ? "PFD-100-001-PREVIEW" : "PFD-100-001",
      drawing_title: preview
        ? "甲醇合成装置工艺流程图（预览区段）"
        : "甲醇合成装置工艺流程图",
      equipment_tags: preview
        ? testData.equipment_draft_datasheets.tags_full.slice(0, 12)
        : testData.equipment_draft_datasheets.tags_full,
      streams: preview ? 8 : testData.material_balance.stream_count,
    },
    stream_table: testData.material_balance.streams,
    battery_limits: [
      { bl_no: "BL-001", stream: "天然气", flow_kgh: 71429, P_MPaG: 4.0, T_C: 25, phase: "gas" },
      { bl_no: "BL-002", stream: "产品甲醇", flow_kgh: 37500, P_MPaG: 0.5, T_C: 40, phase: "liquid" },
    ],
    line_list: preview ? fixture.payload.line_list.slice(0, 8) : fixture.payload.line_list,
    main_control_loops: (testData.control_philosophy?.cause_effect || []).slice(0, 6),
  },
  citations: [
    { source_type: "standard", source_id: "SH/T 3121-2022", clause: "4.0" },
    { source_type: "standard", source_id: "GB/T 50933-2013", clause: "5.3" },
  ],
  risk_level: "high",
  confidence: 0.88,
  status: "draft",
};

const outDir = path.join(MEOH_PILOT, "cad-output");
mkdirSync(outDir, { recursive: true });
process.env.VDI_WORKSPACE_ROOT = WORKSPACE_ROOT;

const drawingNo = disciplineOutput.payload.pfd.drawing_number;
const outputBasename = drawingNo.replace(/[^a-zA-Z0-9_-]/g, "_");
console.log(`[CP-1] 模式: ${preview ? "preview (12 设备 / 8 管段)" : "full (48 设备 — 单页概览，符号会重叠)"}`);
if (!preview) {
  console.warn("[CP-1] ⚠ --full 模式 48 台设备单页仍较密，建议分单元多页");
}
console.log(`[CP-1] 图幅: ${SHEET_SIZE}  ·  图号: ${drawingNo}`);

// 清理同 basename 旧成果，避免目录扫描混进历史文件
for (const f of readdirSync(outDir)) {
  if (f.startsWith(outputBasename) && !f.includes(".FCBak")) {
    try {
      unlinkSync(path.join(outDir, f));
    } catch {
      /* ignore */
    }
  }
}

const plantModel = disciplineOutputToPlantModel(disciplineOutput, {
  project_id: MEOH_PROJECT_ID,
  revision: "A",
  sheet_size: SHEET_SIZE,
});
const plantWrite = writePlantModel(MEOH_PROJECT_ID, plantModel);

const cadCommand = plantModelToCadCommand(plantModel, {
  drawing_type: "pfd",
  project_id: MEOH_PROJECT_ID,
  project_name: "甲醇合成装置",
  output_directory: outDir,
  formats: ["FCStd", "PDF", "DXF"],
  create_sheet: true,
  sheet_size: SHEET_SIZE,
});
cadCommand.plant_model = plantModel;
cadCommand.options = {
  ...cadCommand.options,
  merge_mode: false,
  fresh_document: true,
  create_sheet: true,
  export_object_list: true,
  use_simple_symbols: true,
  sheet_size: SHEET_SIZE,
};
cadCommand.title_block.project_name = "甲醇合成装置";
cadCommand.title_block.drawing_number = drawingNo;
cadCommand.title_block.drawing_title = disciplineOutput.payload.pfd.drawing_title;
cadCommand.title_block.sheet_size = SHEET_SIZE;
cadCommand.output.basename = outputBasename;

console.log("[CP-1] RPC check...");
const conn = await cadClient.checkConnection();
if (!conn.connected) {
  console.error("FreeCAD RPC offline:", conn.error);
  console.error("  → bash pilotdeck-vdi/freecad/verify-rpc.sh");
  process.exit(2);
}

console.log("[CP-1] Generating PFD in FreeCAD...");
const rpcResult = await cadClient.execute(cadCommand);

function normalizeExported(exported) {
  if (Array.isArray(exported)) return exported;
  if (exported && typeof exported === "object") return Object.values(exported);
  return [];
}

const exportedFiles = normalizeExported(rpcResult.exported);

function discoverOutputFiles(dir, basename) {
  const extMap = { FCStd: "FCStd", PDF: "PDF", DXF: "DXF", CSV: "CSV" };
  try {
    return readdirSync(dir)
      .filter((f) => f.startsWith(basename) && !f.includes(".FCBak"))
      .map((f) => {
        const ext = f.includes(".") ? f.slice(f.lastIndexOf(".") + 1) : "FILE";
        const fmt =
          ext.toLowerCase() === "fcstd" ? "FCStd" : ext.toUpperCase();
        return { format: extMap[fmt] || fmt, path: path.join(dir, f) };
      });
  } catch {
    return [];
  }
}

const outputFiles = discoverOutputFiles(outDir, cadCommand.output.basename);
const allFiles = outputFiles.length ? outputFiles : exportedFiles;

const event =
  rpcResult.status === "success"
    ? publishDrawingGenerated({
        project_id: MEOH_PROJECT_ID,
        payload: {
          drawing_type: "pfd",
          drawing_number: drawingNo,
          mode: preview ? "preview" : "full",
          exported: exportedFiles,
          stats: rpcResult.stats || {},
          cp: "CP-1",
        },
      })
    : { published: false, skipped: "RPC error" };

const deliverables = {
  cp: "CP-1",
  mode: preview ? "preview" : "full",
  drawing_number: drawingNo,
  equipment_count: disciplineOutput.payload.pfd.equipment_tags.length,
  line_count: disciplineOutput.payload.line_list.length,
  plant_model: plantWrite.path,
  symbol_scale: rpcResult.symbol_scale ?? rpcResult.stats?.symbol_scale,
  files: allFiles.map((e) => ({
    format: e.format,
    path: e.path,
    open_hint:
      e.format === "PDF"
        ? "用 PDF 阅读器打开 — 正式 A3 图幅"
        : e.format === "FCStd"
          ? "FreeCAD 打开 → 左侧点 VDI_Sheet（TechDraw 正式图页）"
          : e.format === "DXF"
            ? "用 AutoCAD/ZWCAD 等直接打开"
            : "数据清单",
  })),
  primary_deliverable:
    allFiles.find((e) => e.format === "PDF")?.path ||
    allFiles.find((e) => e.format === "FCStd")?.path ||
    null,
  stats: rpcResult.stats,
  sheet: rpcResult.sheet,
};

const result = { disciplineOutput, plantModel, plantWrite, cadCommand, rpcResult, event, deliverables };
const outPath = path.join(MEOH_PILOT, "outputs/pfd-cp1-result.json");
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2));
writeFileSync(path.join(MEOH_PILOT, "outputs/pfd-deliverables.json"), JSON.stringify(deliverables, null, 2));
writeFileSync(
  path.join(MEOH_PILOT, "outputs/discipline-output-pfd-draft.json"),
  JSON.stringify(disciplineOutput, null, 2)
);

const pfdView = plantModel.views?.find((v) => v.view_type === "pfd") || plantModel.views?.[0];
const manifest = buildDrawingManifest(plantModel, {
  drawing_number: drawingNo,
  view_id: pfdView?.view_id,
  sheet_size: SHEET_SIZE,
  symbol_scale: cadCommand.options?.symbol_scale || deliverables.symbol_scale || 1.0,
  files: Object.fromEntries(allFiles.map((f) => [f.format.toLowerCase(), f.path])),
});
const manifestPath = path.join(outDir, `${cadCommand.output.basename}-manifest.json`);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
deliverables.drawing_manifest = manifestPath;
console.log(`\n[CP-1] drawing-manifest: ${manifestPath} (${manifest.objects.length} objects)`);

console.log("\n[CP-1] 成果物");
for (const f of deliverables.files) {
  console.log(`  ${f.format.padEnd(6)} ${f.path}`);
  console.log(`         ${f.open_hint}`);
}
if (deliverables.primary_deliverable) {
  console.log(`\n✓ 首选打开: ${deliverables.primary_deliverable}`);
  console.log("  FreeCAD 用户: 左侧树 → VDI_Sheet（不要只看模型视图）");
} else {
  console.warn("\n⚠ PDF 未生成 — 检查 FreeCAD TechDraw 是否可用");
}

if (rpcResult.status !== "success" && rpcResult.document == null) {
  console.error("[CP-1] FAILED:", rpcResult.message || rpcResult);
  process.exit(1);
}
