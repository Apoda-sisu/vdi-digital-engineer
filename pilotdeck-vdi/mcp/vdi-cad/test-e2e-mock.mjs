#!/usr/bin/env node
/**
 * E2E test with mock XML-RPC server (no FreeCAD required).
 * Validates: converter → RPC client → event publish.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { disciplineOutputToCadCommand, disciplineOutputToPlantModel, buildMethanolFixture } from "./converter.mjs";
import { publishDrawingGenerated, publishPlantObjectChanged, writePlantModel } from "./events.mjs";

const PORT = 19876;
process.env.VDI_CAD_RPC_PORT = String(PORT);

function xmlResponse(value) {
  if (typeof value === "string") {
    return `<?xml version="1.0"?><methodResponse><params><param><value><string>${value}</string></value></param></params></methodResponse>`;
  }
  const members = Object.entries(value)
    .map(([k, v]) => {
      if (typeof v === "string") return `<member><name>${k}</name><value><string>${v}</string></value></member>`;
      if (typeof v === "number") return `<member><name>${k}</name><value><int>${v}</int></value></member>`;
      return `<member><name>${k}</name><value><string>${JSON.stringify(v)}</string></value></member>`;
    })
    .join("");
  return `<?xml version="1.0"?><methodResponse><params><param><value><struct>${members}</struct></value></param></params></methodResponse>`;
}

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const method = body.match(/<methodName>([^<]+)<\/methodName>/)?.[1];
    let result;
    if (method === "ping") result = "pong";
    else if (method === "status") result = { status: "running", active_document: "MockDoc" };
    else if (method === "execute") {
      const outDir = path.join(os.tmpdir(), "vdi-cad-e2e-mock");
      fs.mkdirSync(outDir, { recursive: true });
      const fcstd = path.join(outDir, "PFD-100-001.FCStd");
      const dxf = path.join(outDir, "PFD-100-001.dxf");
      fs.writeFileSync(fcstd, "mock-fcstd");
      fs.writeFileSync(dxf, "mock-dxf");
      result = {
        status: "success",
        drawing_type: "pfd",
        stats: { equipment_count: 48, line_count: 32, stream_count: 32, plant_objects: { created: 92, updated: 0, total: 92 } },
        exported: [
          { format: "FCStd", path: fcstd },
          { format: "DXF", path: dxf },
        ],
        merge_mode: true,
      };
    } else if (method === "extract_plant_model") {
      result = {
        status: "success",
        plant_model: { version: "1.0", project_id: "MEOH-100", objects: [{ object_id: "mock-id", class: "Equipment", tag: "P-401" }] },
      };
    } else if (method === "apply_delta") {
      result = { status: "success", applied: ["mock-id"], count: 1 };
    } else result = { status: "error", message: `unknown method ${method}` };

    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(xmlResponse(result));
  });
});

async function main() {
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  console.log(`[E2E-MOCK] Mock RPC on :${PORT}`);

  const cadClient = await import("./cad-client.mjs");
  const conn = await cadClient.checkConnection();
  if (!conn.connected) throw new Error(`Mock RPC not connected: ${conn.error}`);
  console.log("[E2E-MOCK] ✓ RPC connected");

  const fixture = buildMethanolFixture();
  const plantModel = disciplineOutputToPlantModel(fixture, { project_id: "MEOH-100" });
  if (plantModel.objects.length < 141) throw new Error(`Expected >=141 plant objects, got ${plantModel.objects.length}`);
  console.log("[E2E-MOCK] ✓ PlantModel:", plantModel.objects.length, "objects");

  const cmd = disciplineOutputToCadCommand(fixture, { drawing_type: "pfd", project_id: "MEOH-100" });
  if (cmd.equipment.length !== 48) throw new Error(`Expected 48 equipment, got ${cmd.equipment.length}`);
  if (!cmd.equipment[0].object_id) throw new Error("Equipment missing object_id");
  if (cmd.lines.length !== 32) throw new Error(`Expected 32 lines, got ${cmd.lines.length}`);
  console.log("[E2E-MOCK] ✓ Converter: 48 eq / 32 lines / 12+ instruments");

  process.env.VDI_WORKSPACE_ROOT = path.join(os.tmpdir(), "vdi-workspaces-e2e");
  const written = writePlantModel("MEOH-100", plantModel);
  if (!written.written) throw new Error(`PlantModel write failed: ${written.error}`);
  console.log("[E2E-MOCK] ✓ PlantModel written:", written.path);

  const rpcResult = await cadClient.execute(cmd);
  if (rpcResult.status !== "success") throw new Error(`RPC failed: ${JSON.stringify(rpcResult)}`);
  console.log("[E2E-MOCK] ✓ RPC execute");

  const exported = rpcResult.exported || [];
  if (!exported.find((e) => e.path?.endsWith(".FCStd"))) throw new Error("Missing FCStd export");
  if (!exported.find((e) => e.path?.endsWith(".dxf"))) throw new Error("Missing DXF export");
  console.log("[E2E-MOCK] ✓ FCStd + DXF paths returned");

  process.env.VDI_WORKSPACE_ROOT = path.join(os.tmpdir(), "vdi-workspaces-e2e");
  const event = publishDrawingGenerated({
    project_id: "MEOH-100",
    payload: {
      drawing_type: "pfd",
      drawing_number: "PFD-100-001",
      exported,
      stats: rpcResult.stats,
      e2e_mock: true,
    },
  });
  if (!event.published) throw new Error(`Event publish failed: ${event.error}`);
  if (!fs.existsSync(event.inbox_path)) throw new Error("Event inbox file missing");
  console.log("[E2E-MOCK] ✓ drawing.generated event:", event.event_id);

  const extractResult = await cadClient.extractPlantModel("MEOH-100");
  if (extractResult.status !== "success") throw new Error("extract_plant_model failed");
  console.log("[E2E-MOCK] ✓ extract_plant_model");

  const deltaResult = await cadClient.applyDelta({
    updates: [{ object_id: "mock-id", attributes: { design_P_MPaG: 2.5 } }],
  });
  if (deltaResult.status !== "success") throw new Error("apply_delta failed");
  console.log("[E2E-MOCK] ✓ apply_delta");

  const plantEvent = publishPlantObjectChanged({
    project_id: "MEOH-100",
    object_id: cmd.equipment[0].object_id,
    tag: cmd.equipment[0].tag,
  });
  if (!plantEvent.published) throw new Error(`plant.object.changed failed: ${plantEvent.error}`);
  console.log("[E2E-MOCK] ✓ plant.object.changed event:", plantEvent.event_id);

  server.close();
  console.log("\n[E2E-MOCK] PASSED — full pipeline (mock RPC) verified");
}

main().catch((e) => {
  console.error("[E2E-MOCK] FAILED:", e.message);
  server.close();
  process.exit(1);
});
