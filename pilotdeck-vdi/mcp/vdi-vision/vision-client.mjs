/**
 * VDI Vision Client — 表格/文字类图片解读
 * 支持 OpenAI 兼容云端 API 与本地 Ollama，通过 VISION_PROVIDER 切换
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../../..");

const SUPPORTED_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);
const MIME_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

const ANALYSIS_PROMPT = `你是文档图片解读助手。请从图片中提取可见的文字和表格内容（不要解读工程图纸符号或 P&ID 图元）。

仅返回 JSON，格式如下：
{
  "content_type": "text" | "table" | "mixed" | "empty",
  "text_blocks": [{ "text": "完整段落或标题", "role": "title|paragraph|label|footer|other" }],
  "tables": [{
    "title": "表格标题或 null",
    "headers": ["列1", "列2"],
    "rows": [["值1", "值2"]]
  }],
  "key_values": [{ "key": "标签", "value": "值" }],
  "summary": "一两句话概括图片内容",
  "confidence": "high" | "medium" | "low",
  "notes": "识别难点或不确定之处，无则空字符串"
}

要求：
1. 表格按行列还原，合并单元格在 notes 中说明
2. 保留原文数值和单位，不要换算
3. 看不清的内容写在 notes，不要猜测
4. 只输出 JSON，不要 markdown 代码块`;

export function getVisionConfig(overrideProvider) {
  const provider = (overrideProvider || process.env.VISION_PROVIDER || "openai").toLowerCase();
  const normalized = provider === "ollama" ? "ollama" : "openai";

  return {
    provider: normalized,
    apiKey: process.env.VISION_API_KEY || process.env.OPENAI_API_KEY || "",
    apiBase: (process.env.VISION_API_BASE || process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, ""),
    model:
      normalized === "ollama"
        ? process.env.VISION_MODEL_OLLAMA || process.env.VISION_MODEL || "llava"
        : process.env.VISION_MODEL_OPENAI || process.env.VISION_MODEL || "gpt-4o-mini",
    ollamaBase: (process.env.OLLAMA_BASE || "http://127.0.0.1:11434").replace(/\/$/, ""),
    supported_formats: [...SUPPORTED_EXT],
  };
}

export function resolveImagePath(filePath) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("file_path required");
  }

  const fullPath = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.normalize(path.resolve(PROJECT_ROOT, filePath));

  const rootWithSep = PROJECT_ROOT.endsWith(path.sep) ? PROJECT_ROOT : PROJECT_ROOT + path.sep;
  if (fullPath !== PROJECT_ROOT && !fullPath.startsWith(rootWithSep)) {
    throw new Error(`文件路径必须在项目目录内: ${PROJECT_ROOT}`);
  }

  if (!fs.existsSync(fullPath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    throw new Error(`不是文件: ${filePath}`);
  }

  const ext = path.extname(fullPath).slice(1).toLowerCase();
  if (!SUPPORTED_EXT.has(ext)) {
    throw new Error(`不支持的图片格式: .${ext}，支持: ${[...SUPPORTED_EXT].join(", ")}`);
  }

  return { fullPath, ext, size: stat.size };
}

export function loadImageBase64(fullPath, ext) {
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  const buffer = fs.readFileSync(fullPath);
  return {
    mime,
    base64: buffer.toString("base64"),
    size: buffer.length,
  };
}

function buildUserPrompt(focus) {
  if (!focus) return ANALYSIS_PROMPT;
  return `${ANALYSIS_PROMPT}\n\n额外关注：${focus}`;
}

function extractJson(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      return JSON.parse(fenced[1].trim());
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("无法从模型响应中解析 JSON");
  }
}

async function callOpenAiVision(config, prompt, image) {
  if (!config.apiKey) {
    throw new Error("云端模式需要 VISION_API_KEY 或 OPENAI_API_KEY");
  }

  const payload = {
    model: config.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${image.mime};base64,${image.base64}`,
            },
          },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 4096,
  };

  const resp = await fetch(`${config.apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Vision API HTTP ${resp.status}: ${body.slice(0, 500)}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callOllamaVision(config, prompt, image) {
  const payload = {
    model: config.model,
    messages: [{ role: "user", content: prompt }],
    images: [image.base64],
    stream: false,
    options: { temperature: 0.1, num_predict: 4096 },
  };

  const resp = await fetch(`${config.ollamaBase}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180_000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Ollama HTTP ${resp.status}: ${body.slice(0, 500)}`);
  }

  const data = await resp.json();
  return data.message?.content || "";
}

export async function checkVisionProvider(config) {
  const started = Date.now();
  try {
    if (config.provider === "ollama") {
      const resp = await fetch(`${config.ollamaBase}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) {
        return {
          available: false,
          provider: config.provider,
          model: config.model,
          message: `Ollama 不可达: HTTP ${resp.status}`,
          latency_ms: Date.now() - started,
        };
      }
      const data = await resp.json();
      const models = (data.models || []).map((m) => m.name || "");
      const hasModel = models.some((m) => m === config.model || m.startsWith(`${config.model}:`));
      return {
        available: hasModel,
        provider: config.provider,
        model: config.model,
        endpoint: config.ollamaBase,
        installed_models: models.slice(0, 10),
        message: hasModel ? "Ollama 可用" : `模型 ${config.model} 未安装，请 ollama pull ${config.model}`,
        latency_ms: Date.now() - started,
      };
    }

    if (!config.apiKey) {
      return {
        available: false,
        provider: config.provider,
        model: config.model,
        message: "未配置 VISION_API_KEY / OPENAI_API_KEY",
        latency_ms: Date.now() - started,
      };
    }

    const resp = await fetch(`${config.apiBase}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    return {
      available: resp.ok,
      provider: config.provider,
      model: config.model,
      endpoint: config.apiBase,
      message: resp.ok ? "云端 Vision API 可达" : `API 不可达: HTTP ${resp.status}`,
      latency_ms: Date.now() - started,
    };
  } catch (err) {
    return {
      available: false,
      provider: config.provider,
      model: config.model,
      message: err.message,
      latency_ms: Date.now() - started,
    };
  }
}

/**
 * 解读图片中的表格与文字
 * @param {{ file_path: string, focus?: string, provider?: 'openai'|'ollama' }} args
 */
export async function analyzeImage(args) {
  const { file_path, focus, provider: providerOverride } = args;
  const config = getVisionConfig(providerOverride);
  const { fullPath, ext, size: fileSize } = resolveImagePath(file_path);
  const image = loadImageBase64(fullPath, ext);
  const prompt = buildUserPrompt(focus);

  const started = Date.now();
  const rawText =
    config.provider === "ollama"
      ? await callOllamaVision(config, prompt, image)
      : await callOpenAiVision(config, prompt, image);

  const parsed = extractJson(rawText);

  return {
    source_file: file_path,
    resolved_path: fullPath,
    format: ext,
    file_size_bytes: fileSize,
    provider: config.provider,
    model: config.model,
    latency_ms: Date.now() - started,
    result: parsed,
    verdict: parsed.content_type === "empty" ? "未识别到有效文字或表格" : "解析成功",
  };
}
