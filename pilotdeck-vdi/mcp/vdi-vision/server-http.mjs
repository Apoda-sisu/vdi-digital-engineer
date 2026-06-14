#!/usr/bin/env node
/**
 * VDI Vision HTTP Gateway
 * 将图片解读能力暴露为 REST API，供 Docker 部署与外部调用
 */
import express from "express";
import cors from "cors";
import {
  analyzeImage,
  checkVisionProvider,
  getVisionConfig,
} from "./vision-client.mjs";

const PORT = process.env.PORT || 3004;
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
  const config = getVisionConfig();
  res.json({
    service: "vdi-vision",
    version: "1.0.0",
    description: "表格/文字类图片解读（本地 Ollama / 云端 OpenAI 兼容 API）",
    provider: config.provider,
    model: config.model,
    endpoints: {
      "GET  /health": "健康检查",
      "GET  /api/status": "Vision 后端状态",
      "POST /api/analyze": "解读图片 (body: { file_path, focus?, provider? })",
    },
  });
});

app.get("/health", async (req, res) => {
  const config = getVisionConfig();
  const check = await checkVisionProvider(config);
  res.json({
    status: "healthy",
    service: "vdi-vision",
    version: "1.0.0",
    provider: config.provider,
    model: config.model,
    vision_available: check.available,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/status", async (req, res) => {
  try {
    const provider = req.query.provider;
    const config = getVisionConfig(provider);
    const check = await checkVisionProvider(config);
    res.json({
      config: {
        provider: config.provider,
        model: config.model,
        supported_formats: config.supported_formats,
      },
      check,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const { file_path, focus, provider } = req.body || {};
    if (!file_path) {
      return res.status(400).json({ error: "file_path required" });
    }
    const result = await analyzeImage({ file_path, focus, provider });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  const config = getVisionConfig();
  console.log(`[vdi-vision] HTTP server on :${PORT} (provider=${config.provider}, model=${config.model})`);
});
