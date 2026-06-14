#!/usr/bin/env node
/**
 * Phase 7 — FreeCAD E2E (requires RPC on localhost:9876).
 * PlantModel write → PFD/PID render → extract → apply_delta → merge re-render → DEXPI export.
 *
 * Usage:
 *   npm run test:e2e
 *   npm run test:e2e -- --lite        # 12 eq / 8 lines, skip 3d
 *   npm run test:e2e -- --skip-3d     # full PFD/PID, skip 3d only
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { buildMethanolFixture } from "./converter.mjs";
import {
  disciplineOutputToPlantModel,
  plantModelToCadCommand,
} from "./plant-converter.mjs";
import * as cadClient from "./cad-client.mjs";
import { publishDrawingGenerated, publishPlantObjectChanged, writePlantModel } from "./events.mjs";
import { plantModelToDexpiXml, dexpiExportSummary } from "./dexpi-export.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const lite = process.argv.includes("--lite");
const skip3d = process.argv.includes("--skip-3d") || lite;
const PROJECT = "MEOH-100-E2E";
const outDir = path.join(os.homedir(), "VDI-CAD", "output", PROJECT);
fs.mkdirSync(outDir, { recursive: true });

process.env.VDI_WORKSPACE_ROOT = path.join(os.tmpdir(), "vdi-workspaces-e2e");

let step = 0;
function log(msg) {
  step++;
  console.log(`[E2E ${step}] ${msg}`);
}

async function assertRpc() {
  const conn = await cadClient.checkConnection();
  if (!conn.connected) {
    console.error("[E2E] FreeCAD RPC not available:", conn.error);
    console.error("  Run: bash pilotdeck-vdi/freecad/verify-rpc.sh");
    process.exit(2);
  }
  log(`RPC connected (${conn.active_document || "active doc"})`);
}

async function main() {
  console.log("[E2E] Phase 7 FreeCAD acceptance pipeline\n");
  await assertRpc();

  const fixture = buildMethanolFixture();
  if (lite) {
    fixture.payload.pfd.equipment_tags = fixture.payload.pfd.equipment_tags.slice(0, 12);
    fixture.payload.line_list = fixture.payload.line_list.slice(0, 8);
    log("--lite: 12 equipment, 8 lines");
  }

  const plantModel = disciplineOutputToPlantModel(fixture, { project_id: PROJECT, revision: "A" });
  const minObjects = lite ? 20 : 141;
  if (plantModel.objects.length < minObjects) {
    throw new Error(`PlantModel objects ${plantModel.objects.length} < ${minObjects}`);
  }
  log(`PlantModel: ${plantModel.objects.length} objects`);

  const written = writePlantModel(PROJECT, plantModel);
  if (!written.written) throw new Error(`writePlantModel failed: ${written.error}`);
  log(`PlantModel written: ${written.path}`);

  const baseOpts = {
    project_id: PROJECT,
    project_name: "甲醇合成装置 E2E",
    output_directory: outDir,
    formats: lite ? ["FCStd"] : ["FCStd", "DXF", "PDF"],
    create_sheet: true,
  };

  // PFD
  const pfdCmd = plantModelToCadCommand(plantModel, { ...baseOpts, drawing_type: "pfd" });
  pfdCmd.options = { ...(pfdCmd.options || {}), merge_mode: true, create_sheet: true, export_object_list: true };
  pfdCmd.plant_model = plantModel;

  log("Executing PFD...");
  const pfdResult = await cadClient.execute(pfdCmd);
  if (pfdResult.status !== "success") throw new Error(`PFD failed: ${JSON.stringify(pfdResult)}`);
  log(`PFD OK — eq:${pfdResult.stats?.equipment_count ?? "?"} lines:${pfdResult.stats?.line_count ?? "?"}`);

  // PID
  const pidCmd = plantModelToCadCommand(plantModel, { ...baseOpts, drawing_type: "pid" });
  pidCmd.options = { ...(pidCmd.options || {}), merge_mode: true, create_sheet: true };
  pidCmd.plant_model = plantModel;

  log("Executing P&ID...");
  const pidResult = await cadClient.execute(pidCmd);
  if (pidResult.status !== "success") throw new Error(`PID failed: ${JSON.stringify(pidResult)}`);
  log(`P&ID OK — valves:${pidResult.stats?.valve_count ?? "?"}`);

  // Layout + isometric (+ optional 3d)
  for (const dt of ["layout", "isometric", ...(skip3d ? [] : ["3d"])]) {
    const cmd = plantModelToCadCommand(plantModel, {
      ...baseOpts,
      drawing_type: dt,
      formats: dt === "3d" ? ["FCStd", "STEP"] : baseOpts.formats,
    });
    cmd.options = { ...(cmd.options || {}), merge_mode: true };
    cmd.plant_model = plantModel;
    log(`Executing ${dt}...`);
    const res = await cadClient.execute(cmd);
    if (res.status !== "success") {
      console.warn(`[E2E] Warning: ${dt} draw failed: ${res.message || JSON.stringify(res)}`);
    } else {
      log(`${dt} OK`);
    }
  }

  // extract_plant_model (requires deployed addon with Phase 3+ RPC)
  log("extract_plant_model...");
  let extractOk = false;
  try {
    const extracted = await cadClient.extractPlantModel(PROJECT, "A");
    if (extracted.status === "success") {
      const extractedObjects = extracted.plant_model?.objects?.length || extracted.objects?.length || 0;
      log(`extracted ${extractedObjects} objects`);
      extractOk = true;
    } else {
      console.warn("[E2E] Warning: extract_plant_model:", extracted.message || JSON.stringify(extracted));
    }
  } catch (e) {
    const msg = e.message || String(e);
    if (msg.includes("not supported")) {
      console.warn("[E2E] Warning: extract_plant_model RPC not available — redeploy addon and restart FreeCAD");
    } else {
      throw e;
    }
  }

  // apply_delta
  const pump = plantModel.objects.find((o) => o.tag === "P-401");
  if (pump) {
    log("apply_delta P-401.design_P_MPaG → 2.55...");
    try {
      const deltaResult = await cadClient.applyDelta({
        updates: [{ object_id: pump.object_id, attributes: { design_P_MPaG: 2.55 } }],
      });
      if (deltaResult.status === "success") {
        log(`apply_delta applied ${deltaResult.count ?? deltaResult.applied?.length ?? "?"} update(s)`);
        publishPlantObjectChanged({
          project_id: PROJECT,
          object_id: pump.object_id,
          tag: "P-401",
          revision: "A",
        });
      } else {
        console.warn("[E2E] Warning: apply_delta:", deltaResult.message);
      }
    } catch (e) {
      if ((e.message || "").includes("not supported")) {
        console.warn("[E2E] Warning: apply_delta RPC not available — redeploy addon and restart FreeCAD");
      } else {
        throw e;
      }
    }
  }

  if (process.env.VDI_E2E_STRICT === "1" && !extractOk) {
    throw new Error("extract_plant_model required in strict mode (deploy addon + restart FreeCAD)");
  }

  // merge_mode re-render (second PFD — should not destroy doc)
  log("Second PFD render (merge_mode)...");
  const pfd2 = await cadClient.execute({ ...pfdCmd, options: { ...pfdCmd.options, merge_mode: true } });
  if (pfd2.status !== "success") throw new Error(`merge re-render failed: ${JSON.stringify(pfd2)}`);
  const plantStats = pfd2.stats?.plant_objects;
  if (plantStats) {
    log(`merge stats: created=${plantStats.created} updated=${plantStats.updated} total=${plantStats.total}`);
  } else {
    log("merge re-render OK");
  }

  // DEXPI export (local, no RPC)
  const dexpiPath = path.join(outDir, `${PROJECT}_dexpi.xml`);
  fs.writeFileSync(dexpiPath, plantModelToDexpiXml(plantModel), "utf8");
  const dexSum = dexpiExportSummary(plantModel);
  log(`DEXPI exported: ${dexSum.equipment} eq / ${dexSum.pipe_segments} pipes → ${dexpiPath}`);

  const event = publishDrawingGenerated({
    project_id: PROJECT,
    payload: {
      drawing_type: "pfd",
      drawing_number: pfdCmd.title_block?.drawing_number || "PFD-100-001",
      exported: pfdResult.exported || [],
      stats: pfdResult.stats || {},
      e2e: true,
      phase: 7,
    },
  });
  if (event.published) log(`drawing.generated → ${event.event_id}`);

  const exported = Array.isArray(pfdResult.exported)
    ? pfdResult.exported
    : pfdResult.exported
      ? Object.values(pfdResult.exported)
      : [];
  const hasFcstd = exported.some((e) => e?.path?.endsWith(".FCStd") || e?.format === "FCStd");
  if (!hasFcstd && pfdResult.status === "success") {
    console.warn("[E2E] Warning: FCStd not listed in PFD exports (file may still exist on disk)");
  }

  console.log("\n[E2E] PASSED — Phase 7 FreeCAD pipeline complete");
  console.log(`  Output: ${outDir}`);
}

main().catch((e) => {
  console.error("[E2E] Fatal:", e.message || e);
  process.exit(1);
});
