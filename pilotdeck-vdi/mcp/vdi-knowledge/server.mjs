#!/usr/bin/env node
/**
 * VDI 知识库 MCP（stdio）— 深集成 vdi-knowledge 插件
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_INDEX = path.resolve(__dirname, "../../data/knowledge-clauses.json");

function loadIndex() {
  const indexPath =
    process.env.VDI_KNOWLEDGE_INDEX ||
    DEFAULT_INDEX;
  const raw = fs.readFileSync(indexPath, "utf8");
  const data = JSON.parse(raw);
  return { indexPath, clauses: data.clauses || [] };
}

function scoreClause(clause, queryTerms) {
  if (!queryTerms.size) return 0;
  const tokens = new Set(clause.tokens || []);
  let score = 0;
  for (const t of queryTerms) {
    if (tokens.has(t)) score += 1;
  }
  const kw = (clause.keywords || []).map((k) => k.toLowerCase());
  for (const t of queryTerms) {
    if (kw.some((k) => k.includes(t))) score += 2;
  }
  return score;
}

function tokenize(query) {
  return new Set(
    (query.match(/[\u4e00-\u9fff\w]+/gi) || []).map((s) => s.toLowerCase())
  );
}

function search(clauses, { query, discipline, source_type, limit }) {
  const terms = tokenize(query);
  const ranked = [];
  for (const c of clauses) {
    if (discipline && c.discipline && c.discipline !== discipline) continue;
    if (source_type && c.source_type !== source_type) continue;
    const score = scoreClause(c, terms);
    if (score <= 0) continue;
    ranked.push({
      score,
      source_type: c.source_type,
      source_id: c.source_id,
      version: c.version,
      clause: c.clause,
      effective_date: c.effective_date,
      discipline: c.discipline,
      excerpt: c.content,
      relevance: Math.min(0.99, 0.4 + score * 0.12),
    });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit).map(({ score: _s, ...rest }) => rest);
}

function getCitation(clauses, { source_id, clause, version }) {
  const hit = clauses.find(
    (c) =>
      c.source_id === source_id &&
      c.clause === clause &&
      (!version || c.version === version)
  );
  if (!hit) {
    return null;
  }
  return {
    source_type: hit.source_type,
    source_id: hit.source_id,
    version: hit.version,
    clause: hit.clause,
    effective_date: hit.effective_date,
    discipline: hit.discipline,
    content: hit.content,
    file: hit.file,
  };
}

const SearchSchema = z.object({
  query: z.string().describe("检索关键词，如：消防给水 消火栓流量"),
  discipline: z
    .string()
    .optional()
    .describe("专业过滤：water/process/piping/instrument/hse 等"),
  source_type: z
    .enum(["standard", "rule", "case"])
    .optional()
    .describe("来源类型"),
  limit: z.number().int().min(1).max(20).optional().default(5),
});

const CitationSchema = z.object({
  source_id: z.string().describe("规范编号，如 GB 50974-2014"),
  clause: z.string().describe("条款号，如 3.3.2"),
  version: z.string().optional().describe("版本，可选"),
});

async function main() {
  const { indexPath, clauses } = loadIndex();
  const server = new Server(
    {
      name: "vdi-knowledge",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {} },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "vdi_search_knowledge",
        description:
          "检索 VDI 知识库（法规/国标/行标/公司规定/案例）。返回带条款号的摘录，用于设计结论与 citations。",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            discipline: { type: "string" },
            source_type: { type: "string", enum: ["standard", "rule", "case"] },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
      {
        name: "vdi_get_citation",
        description: "按规范号+条款号获取完整条文（证据链引用）。",
        inputSchema: {
          type: "object",
          properties: {
            source_id: { type: "string" },
            clause: { type: "string" },
            version: { type: "string" },
          },
          required: ["source_id", "clause"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      if (name === "vdi_search_knowledge") {
        const input = SearchSchema.parse(args ?? {});
        const results = search(clauses, input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { index: indexPath, count: results.length, results },
                null,
                2
              ),
            },
          ],
        };
      }
      if (name === "vdi_get_citation") {
        const input = CitationSchema.parse(args ?? {});
        const citation = getCitation(clauses, input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(citation ?? { error: "not_found" }, null, 2),
            },
          ],
          isError: !citation,
        };
      }
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: String(err) }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
