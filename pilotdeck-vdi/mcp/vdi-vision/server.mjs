#!/usr/bin/env node
/**
 * VDI Vision MCP（stdio）— 表格/文字类图片解读
 *
 * 工具：
 *   - vdi_analyze_image   解读图片中的文字与表格
 *   - vdi_vision_status   检查当前 Vision 后端可用性
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  analyzeImage,
  checkVisionProvider,
  getVisionConfig,
} from "./vision-client.mjs";

const AnalyzeImageSchema = z.object({
  file_path: z.string().describe("图片文件路径（相对项目根或绝对路径）"),
  focus: z.string().optional().describe("可选：额外关注的内容，如「提取设备参数表」"),
  provider: z.enum(["openai", "ollama"]).optional().describe("可选：覆盖 VISION_PROVIDER 环境变量"),
});

const StatusSchema = z.object({
  provider: z.enum(["openai", "ollama"]).optional().describe("可选：检查指定后端，默认读取环境变量"),
});

async function main() {
  const server = new Server(
    { name: "vdi-vision", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "vdi_analyze_image",
        description:
          "解读图片中的文字与表格内容（截图、扫描件、照片内的文档页）。适用于 PNG/JPG/WebP 等，不用于工程图纸符号识别。支持本地 Ollama 与云端 OpenAI 兼容 API，可通过 provider 参数或 VISION_PROVIDER 环境变量切换。",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "图片路径，如 uploads/report.png" },
            focus: { type: "string", description: "额外关注的内容描述" },
            provider: { type: "string", enum: ["openai", "ollama"], description: "vision 后端" },
          },
          required: ["file_path"],
        },
      },
      {
        name: "vdi_vision_status",
        description:
          "检查 Vision 后端配置与连通性（云端 API Key 或本地 Ollama 模型是否可用）。",
        inputSchema: {
          type: "object",
          properties: {
            provider: { type: "string", enum: ["openai", "ollama"] },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      let result;
      switch (name) {
        case "vdi_analyze_image":
          result = await analyzeImage(AnalyzeImageSchema.parse(args ?? {}));
          break;
        case "vdi_vision_status": {
          const parsed = StatusSchema.parse(args ?? {});
          const config = getVisionConfig(parsed.provider);
          result = {
            config: {
              provider: config.provider,
              model: config.model,
              api_base: config.provider === "openai" ? config.apiBase : undefined,
              ollama_base: config.provider === "ollama" ? config.ollamaBase : undefined,
              supported_formats: config.supported_formats,
            },
            check: await checkVisionProvider(config),
          };
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[vdi-vision] MCP server running (stdio)");
}

main().catch((err) => {
  console.error("[vdi-vision] Fatal:", err);
  process.exit(1);
});
