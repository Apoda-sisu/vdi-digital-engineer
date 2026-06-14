#!/usr/bin/env node
/**
 * VDI CAD MCP Server — stdio transport.
 * Tools: vdi_cad_generate, vdi_cad_status, vdi_cad_export,
 *        vdi_cad_screenshot, vdi_cad_execute
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import path from "node:path";
import os from "node:os";

import * as cadClient from "./cad-client.mjs";
import {
  disciplineOutputToCadCommand,
  disciplineOutputToPlantModel,
  buildMethanolFixture,
  mergeDisciplineOutputsForCad,
} from "./converter.mjs";
import { publishDrawingGenerated, publishPlantObjectChanged, writePlantModel, readPlantModel, resolveProjectDir } from "./events.mjs";
import { validatePlantModelForPublish } from "./plant-model-validator.mjs";
import { plantModelToObjectListCsv, equipmentDesignSummary } from "./plant-object-export.mjs";
import { plantModelToDexpiXml, dexpiExportSummary } from "./dexpi-export.mjs";
import { plantModelToCfihosJson, cfihosExportSummary } from "./cfihos-export.mjs";
import { applyPlantDelta, syncViewRevisions, validateRevisionConsistency } from "./revision-tracker.mjs";
import { getObjectFromProject, getObjectByTag, formatPlantObject } from "./plant-object-lookup.mjs";
import { buildDrawingManifest, resolvePickFromManifest } from "./manifest-export.mjs"; = z.object({
  discipline_output: z.any().describe("DisciplineOutput JSON from vdi-process-pfd / vdi-process-pid / merged pfd_pid"),
  discipline_outputs: z.array(z.any()).optional().describe("Optional array to merge pfd+pid+control before generate"),
  drawing_type: z.enum(["pfd", "pid", "layout", "isometric", "3d"]).optional().describe("Drawing type override"),
  project_id: z.string().optional(),
  output_directory: z.string().optional(),
  formats: z.array(z.enum(["FCStd", "DXF", "PDF", "STEP"])).optional(),
  publish_event: z.boolean().optional().default(true),
  create_sheet: z.boolean().optional(),
  strict_validation: z.boolean().optional().default(false),
});

const ExportSchema = z.object({
  format: z.enum(["FCStd", "DXF", "PDF", "STEP"]),
  output_path: z.string(),
});

const ScreenshotSchema = z.object({
  output_path: z.string().optional(),
});

const ExecuteSchema = z.object({
  cad_command: z.any().describe("Raw CadCommand v1 JSON"),
});

const ExtractModelSchema = z.object({
  project_id: z.string().optional(),
  revision: z.string().optional().default("A"),
});

const ApplyDeltaSchema = z.object({
  delta: z.any().describe("Delta JSON with updates[]"),
  project_id: z.string().optional(),
  publish_event: z.boolean().optional().default(true),
});

const LoadPlantModelSchema = z.object({
  plant_model: z.any(),
  render_command: z.any().optional(),
  project_id: z.string().optional(),
});

const ValidatePlantModelSchema = z.object({
  plant_model: z.any(),
  stage: z.enum(["design", "checking", "review", "approval"]).optional(),
  min_equipment: z.number().optional(),
});

const ExportObjectListSchema = z.object({
  plant_model: z.any().optional(),
  project_id: z.string().optional(),
  output_path: z.string().optional(),
});

const ExportDexpiSchema = z.object({
  plant_model: z.any().optional(),
  project_id: z.string().optional(),
  output_path: z.string().optional(),
  discipline: z.enum(["PID", "PFD"]).optional(),
});

const ExportCfihosSchema = z.object({
  plant_model: z.any().optional(),
  project_id: z.string().optional(),
  output_path: z.string().optional(),
});

const ApplyPlantDeltaSchema = z.object({
  plant_model: z.any().optional(),
  project_id: z.string().optional(),
  delta: z.any(),
  bump_revision: z.boolean().optional(),
  author: z.string().optional(),
  summary: z.string().optional(),
  write_model: z.boolean().optional().default(true),
  apply_to_cad: z.boolean().optional().default(false),
  publish_event: z.boolean().optional().default(false),
});

const GetObjectSchema = z.object({
  project_id: z.string(),
  object_id: z.string().optional(),
  tag: z.string().optional(),
  include_relationships: z.boolean().optional().default(true),
  include_citations: z.boolean().optional().default(false),
});

const GetDrawingManifestSchema = z.object({
  project_id: z.string(),
  drawing_number: z.string().optional(),
  manifest_path: z.string().optional(),
});

const ResolvePickSchema = z.object({
  project_id: z.string(),
  view_id: z.string().optional(),
  drawing_number: z.string().optional(),
  x: z.number(),
  y: z.number(),
  manifest_path: z.string().optional(),
});

const RegenerateDrawingSchema = z.object({
  project_id: z.string(),
  delta: z.any().optional(),
  drawing_type: z.enum(["pfd", "pid"]).optional().default("pfd"),
  preview: z.boolean().optional().default(true),
  publish_event: z.boolean().optional().default(true),
});

const server = new Server(
  { name: "vdi-cad", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "vdi_cad_generate",
      description:
        "将 DisciplineOutput 转换为 CadCommand 并指挥 FreeCAD 绘图，返回导出文件路径",
      inputSchema: {
        type: "object",
        required: ["discipline_output"],
        properties: {
          discipline_output: { type: "object", description: "DisciplineOutput JSON" },
          drawing_type: { type: "string", enum: ["pfd", "pid", "layout", "isometric", "3d"] },
          project_id: { type: "string" },
          output_directory: { type: "string" },
          formats: { type: "array", items: { type: "string" } },
          publish_event: { type: "boolean", default: true },
        },
      },
    },
    {
      name: "vdi_cad_status",
      description: "检查 FreeCAD RPC 连通性（localhost:9876）",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "vdi_cad_export",
      description: "导出当前 FreeCAD 文档为指定格式",
      inputSchema: {
        type: "object",
        required: ["format", "output_path"],
        properties: {
          format: { type: "string", enum: ["FCStd", "DXF", "PDF", "STEP"] },
          output_path: { type: "string" },
        },
      },
    },
    {
      name: "vdi_cad_screenshot",
      description: "截取 FreeCAD 当前视图（供 AI/人审图）",
      inputSchema: {
        type: "object",
        properties: {
          output_path: { type: "string" },
        },
      },
    },
    {
      name: "vdi_cad_execute",
      description: "执行原始 CadCommand（调试/高级用途）",
      inputSchema: {
        type: "object",
        required: ["cad_command"],
        properties: {
          cad_command: { type: "object" },
        },
      },
    },
    {
      name: "vdi_cad_extract_model",
      description: "从当前 FreeCAD 文档导出 PlantModel JSON",
      inputSchema: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          revision: { type: "string" },
        },
      },
    },
    {
      name: "vdi_cad_apply_delta",
      description: "增量更新 PlantModel 属性到 FreeCAD 文档",
      inputSchema: {
        type: "object",
        required: ["delta"],
        properties: {
          delta: { type: "object" },
          project_id: { type: "string" },
          publish_event: { type: "boolean" },
        },
      },
    },
    {
      name: "vdi_cad_load_plant_model",
      description: "载入/合并 PlantModel 并可选渲染视图",
      inputSchema: {
        type: "object",
        required: ["plant_model"],
        properties: {
          plant_model: { type: "object" },
          render_command: { type: "object" },
          project_id: { type: "string" },
        },
      },
    },
    {
      name: "vdi_cad_validate_plant_model",
      description: "PlantModel 发布闸门校验（设计条件完整性、管径、object_id）",
      inputSchema: {
        type: "object",
        required: ["plant_model"],
        properties: {
          plant_model: { type: "object" },
          stage: { type: "string", enum: ["design", "checking", "review", "approval"] },
          min_equipment: { type: "number" },
        },
      },
    },
    {
      name: "vdi_cad_export_object_list",
      description: "导出 PlantModel 对象清单 CSV（含设备设计条件）",
      inputSchema: {
        type: "object",
        properties: {
          plant_model: { type: "object" },
          project_id: { type: "string" },
          output_path: { type: "string" },
        },
      },
    },
    {
      name: "vdi_cad_export_dexpi",
      description: "导出 PlantModel 为 DEXPI Proteus XML 子集",
      inputSchema: {
        type: "object",
        properties: {
          plant_model: { type: "object" },
          project_id: { type: "string" },
          output_path: { type: "string" },
          discipline: { type: "string", enum: ["PID", "PFD"] },
        },
      },
    },
    {
      name: "vdi_cad_export_cfihos",
      description: "导出 PlantModel 为 CFIHOS 交接 JSON",
      inputSchema: {
        type: "object",
        properties: {
          plant_model: { type: "object" },
          project_id: { type: "string" },
          output_path: { type: "string" },
        },
      },
    },
    {
      name: "vdi_cad_apply_plant_delta",
      description: "增量更新 PlantModel（修订升版 + change_log + 视图版次同步）",
      inputSchema: {
        type: "object",
        required: ["delta"],
        properties: {
          plant_model: { type: "object" },
          project_id: { type: "string" },
          delta: { type: "object" },
          bump_revision: { type: "boolean" },
          author: { type: "string" },
          summary: { type: "string" },
          write_model: { type: "boolean" },
          apply_to_cad: { type: "boolean" },
          publish_event: { type: "boolean" },
        },
      },
    },
    {
      name: "vdi_cad_get_object",
      description: "只读查询 PlantObject（从 plant/model.json，与 FreeCAD TaskPanel 同源）",
      inputSchema: {
        type: "object",
        required: ["project_id"],
        properties: {
          project_id: { type: "string" },
          object_id: { type: "string" },
          tag: { type: "string" },
          include_relationships: { type: "boolean" },
          include_citations: { type: "boolean" },
        },
      },
    },
    {
      name: "vdi_cad_get_drawing_manifest",
      description: "读取 drawing-manifest.json（图面点选热点索引）",
      inputSchema: {
        type: "object",
        required: ["project_id"],
        properties: {
          project_id: { type: "string" },
          drawing_number: { type: "string" },
          manifest_path: { type: "string" },
        },
      },
    },
    {
      name: "vdi_cad_resolve_pick",
      description: "归一化坐标 (0–1) 命中 manifest bbox → object_id",
      inputSchema: {
        type: "object",
        required: ["project_id", "x", "y"],
        properties: {
          project_id: { type: "string" },
          view_id: { type: "string" },
          drawing_number: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          manifest_path: { type: "string" },
        },
      },
    },
    {
      name: "vdi_cad_regenerate_drawing",
      description: "apply_delta → 写 PlantModel → 再出图（Phase 9c 编排）",
      inputSchema: {
        type: "object",
        required: ["project_id"],
        properties: {
          project_id: { type: "string" },
          delta: { type: "object" },
          drawing_type: { type: "string", enum: ["pfd", "pid"] },
          preview: { type: "boolean" },
          publish_event: { type: "boolean" },
        },
      },
    },
  ],
}));

function defaultOutputDir(projectId) {
  const base = process.env.VDI_CAD_OUTPUT_DIR || path.join(os.homedir(), "VDI-CAD", "output");
  return projectId ? path.join(base, projectId) : base;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result;
    switch (name) {
      case "vdi_cad_generate": {
        const input = GenerateSchema.parse(args ?? {});
        const disciplineOutput = input.discipline_outputs?.length
          ? mergeDisciplineOutputsForCad(input.discipline_outputs)
          : input.discipline_output;
        if (!disciplineOutput) throw new Error("discipline_output or discipline_outputs required");
        const projectId = input.project_id || disciplineOutput.project_id || "VDI-PROJECT";
        const outDir = input.output_directory || defaultOutputDir(projectId);

        const plantModel = disciplineOutputToPlantModel(disciplineOutput, {
          project_id: projectId,
          revision: disciplineOutput.revision || "A",
        });

        const validation = validatePlantModelForPublish(plantModel, {
          stage: "checking",
          min_equipment: 1,
        });
        if (input.strict_validation && !validation.publishable) {
          throw new Error(`PlantModel validation failed: ${validation.summary}`);
        }

        writePlantModel(projectId, plantModel);

        const cadCommand = disciplineOutputToCadCommand(disciplineOutput, {
          drawing_type: input.drawing_type,
          project_id: projectId,
          output_directory: outDir,
          formats: input.formats,
          create_sheet: input.create_sheet,
          strict_validation: input.strict_validation,
        });

        const rpcResult = await cadClient.execute(cadCommand);

        let eventResult = null;
        if (input.publish_event && rpcResult?.status === "success") {
          eventResult = publishDrawingGenerated({
            project_id: projectId,
            producer: "PR",
            payload: {
              drawing_type: cadCommand.drawing_type,
              drawing_number: cadCommand.title_block.drawing_number,
              exported: rpcResult.exported || [],
              stats: rpcResult.stats || {},
              discipline: disciplineOutput.discipline,
              output_type: disciplineOutput.output_type,
              plant_model_objects: plantModel.objects?.length || 0,
            },
            object_refs: [cadCommand.title_block.drawing_number],
          });
        }

        result = { plant_model: plantModel, validation, cad_command: cadCommand, rpc_result: rpcResult, event: eventResult };
        break;
      }
      case "vdi_cad_status":
        result = await cadClient.checkConnection();
        break;
      case "vdi_cad_export": {
        const input = ExportSchema.parse(args ?? {});
        result = await cadClient.exportDrawing(input.format, input.output_path);
        break;
      }
      case "vdi_cad_screenshot": {
        const input = ScreenshotSchema.parse(args ?? {});
        const outPath =
          input.output_path ||
          path.join(defaultOutputDir(), `screenshot_${Date.now()}.png`);
        result = await cadClient.screenshot(outPath);
        break;
      }
      case "vdi_cad_execute": {
        const input = ExecuteSchema.parse(args ?? {});
        result = await cadClient.execute(input.cad_command);
        break;
      }
      case "vdi_cad_extract_model": {
        const input = ExtractModelSchema.parse(args ?? {});
        result = await cadClient.extractPlantModel(input.project_id || "", input.revision || "A");
        break;
      }
      case "vdi_cad_apply_delta": {
        const input = ApplyDeltaSchema.parse(args ?? {});
        result = await cadClient.applyDelta(input.delta);
        if (input.publish_event && result?.status === "success" && input.project_id) {
          const applied = result.applied || [];
          result.events = applied.map((oid) =>
            publishPlantObjectChanged({
              project_id: input.project_id,
              object_id: oid,
              revision: input.delta?.revision || "A",
            })
          );
        }
        break;
      }
      case "vdi_cad_load_plant_model": {
        const input = LoadPlantModelSchema.parse(args ?? {});
        result = await cadClient.loadPlantModel(input.plant_model, input.render_command || null);
        break;
      }
      case "vdi_cad_validate_plant_model": {
        const input = ValidatePlantModelSchema.parse(args ?? {});
        result = validatePlantModelForPublish(input.plant_model, {
          stage: input.stage || "checking",
          min_equipment: input.min_equipment,
        });
        break;
      }
      case "vdi_cad_export_object_list": {
        const input = ExportObjectListSchema.parse(args ?? {});
        let model = input.plant_model;
        if (!model && input.project_id) {
          const loaded = readPlantModel(input.project_id);
          if (loaded?.model) model = loaded.model;
        }
        if (!model) throw new Error("plant_model or project_id required");
        const csv = plantModelToObjectListCsv(model);
        const fs = await import("node:fs");
        const outPath =
          input.output_path ||
          path.join(defaultOutputDir(input.project_id || model.project_id), `${model.project_id || "plant"}_object_list.csv`);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, csv, "utf8");
        result = {
          status: "success",
          path: outPath,
          summary: equipmentDesignSummary(model),
          rows: model.objects?.length || 0,
        };
        break;
      }
      case "vdi_cad_export_dexpi": {
        const input = ExportDexpiSchema.parse(args ?? {});
        let model = input.plant_model;
        if (!model && input.project_id) {
          const loaded = readPlantModel(input.project_id);
          if (loaded?.model) model = loaded.model;
        }
        if (!model) throw new Error("plant_model or project_id required");
        const fs = await import("node:fs");
        const xml = plantModelToDexpiXml(model, { discipline: input.discipline || "PID" });
        const outPath =
          input.output_path ||
          path.join(
            defaultOutputDir(input.project_id || model.project_id),
            `${model.project_id || "plant"}_dexpi.xml`
          );
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, xml, "utf8");
        result = {
          status: "success",
          path: outPath,
          summary: dexpiExportSummary(model),
        };
        break;
      }
      case "vdi_cad_export_cfihos": {
        const input = ExportCfihosSchema.parse(args ?? {});
        let model = input.plant_model;
        if (!model && input.project_id) {
          const loaded = readPlantModel(input.project_id);
          if (loaded?.model) model = loaded.model;
        }
        if (!model) throw new Error("plant_model or project_id required");
        const fs = await import("node:fs");
        const json = plantModelToCfihosJson(model);
        const outPath =
          input.output_path ||
          path.join(
            defaultOutputDir(input.project_id || model.project_id),
            `${model.project_id || "plant"}_cfihos.json`
          );
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(json, null, 2), "utf8");
        result = {
          status: "success",
          path: outPath,
          summary: cfihosExportSummary(model),
        };
        break;
      }
      case "vdi_cad_apply_plant_delta": {
        const input = ApplyPlantDeltaSchema.parse(args ?? {});
        let model = input.plant_model;
        const projectId = input.project_id;
        if (!model && projectId) {
          const loaded = readPlantModel(projectId);
          if (loaded?.model) model = loaded.model;
        }
        if (!model) throw new Error("plant_model or project_id required");
        const updated = applyPlantDelta(model, {
          ...input.delta,
          bump_revision: input.bump_revision,
          author: input.author,
          summary: input.summary,
        });
        const revisionCheck = validateRevisionConsistency(updated);
        let writeResult = null;
        if (input.write_model && (projectId || updated.project_id)) {
          writeResult = writePlantModel(projectId || updated.project_id, updated);
        }
        let cadResult = null;
        if (input.apply_to_cad) {
          cadResult = await cadClient.applyDelta(input.delta);
        }
        let events = null;
        if (input.publish_event && projectId) {
          const changed = input.delta?.objects?.map((o) => o.object_id).filter(Boolean) || [];
          events = changed.map((oid) =>
            publishPlantObjectChanged({
              project_id: projectId,
              object_id: oid,
              revision: updated.revision,
            })
          );
        }
        result = {
          status: "success",
          plant_model: updated,
          revision: updated.revision,
          change_log_entries: updated.change_log?.length || 0,
          revision_check: revisionCheck,
          write: writeResult,
          cad: cadResult,
          events,
        };
        break;
      }
      case "vdi_cad_get_object": {
        const input = GetObjectSchema.parse(args ?? {});
        const loaded = readPlantModel(input.project_id);
        if (!loaded.found) throw new Error(loaded.error || "PlantModel not found");
        let obj = null;
        if (input.object_id) {
          obj = loaded.model.objects?.find((o) => o.object_id === input.object_id);
        } else if (input.tag) {
          obj = getObjectByTag(loaded.model, input.tag);
        } else {
          throw new Error("object_id or tag required");
        }
        if (!obj) throw new Error("Object not found");
        if (!input.include_relationships) {
          obj = { ...obj, relationships: undefined };
        }
        result = {
          status: "success",
          object: obj,
          formatted: formatPlantObject(obj),
          project_id: loaded.model.project_id,
          revision: loaded.model.revision,
          source: loaded.path,
        };
        if (input.include_citations) {
          const fs = await import("node:fs");
          const citePath = path.join(resolveProjectDir(input.project_id), "outputs/discipline-output-pfd-draft.json");
          try {
            const draft = JSON.parse(fs.readFileSync(citePath, "utf8"));
            result.citations = draft.citations || [];
          } catch {
            result.citations = [];
          }
        }
        break;
      }
      case "vdi_cad_get_drawing_manifest": {
        const input = GetDrawingManifestSchema.parse(args ?? {});
        const fs = await import("node:fs");
        const projectDir = resolveProjectDir(input.project_id);
        const manifestPath =
          input.manifest_path ||
          path.join(
            projectDir,
            "cad-output",
            `${(input.drawing_number || "PFD-100-001-PREVIEW").replace(/[^a-zA-Z0-9_-]/g, "_")}-manifest.json`
          );
        if (!fs.existsSync(manifestPath)) {
          throw new Error(`Manifest not found: ${manifestPath}`);
        }
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        result = { status: "success", path: manifestPath, manifest };
        break;
      }
      case "vdi_cad_resolve_pick": {
        const input = ResolvePickSchema.parse(args ?? {});
        const fs = await import("node:fs");
        const projectDir = resolveProjectDir(input.project_id);
        const manifestPath =
          input.manifest_path ||
          path.join(
            projectDir,
            "cad-output",
            `${(input.drawing_number || "PFD-100-001-PREVIEW").replace(/[^a-zA-Z0-9_-]/g, "_")}-manifest.json`
          );
        if (!fs.existsSync(manifestPath)) {
          throw new Error(`Manifest not found: ${manifestPath}`);
        }
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const pick = resolvePickFromManifest(manifest, input.x, input.y);
        if (pick.status === "hit") {
          const objResult = getObjectFromProject(input.project_id, pick.object_id);
          result = { ...pick, ...objResult };
        } else {
          result = pick;
        }
        break;
      }
      case "vdi_cad_regenerate_drawing": {
        const input = RegenerateDrawingSchema.parse(args ?? {});
        const { regenerateDrawing } = await import("./regenerate-drawing.mjs");
        result = await regenerateDrawing(input);
        break;
      }
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: err.message }) }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[vdi-cad] MCP server running (stdio)");
}

main().catch((err) => {
  console.error("[vdi-cad] Fatal:", err);
  process.exit(1);
});
