#!/usr/bin/env node
/**
 * VDI Documents HTTP Gateway
 * 包装 Dokumen-Pintar Python MCP 服务为 HTTP REST API
 * 注意：需要容器中安装 python3 和 dokumen-pintar
 */
import express from "express";
import cors from "cors";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3003;
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 检测 Python 环境
let pythonAvailable = false;
let pythonCmd = null;

function checkPython() {
  const candidates = ["python3", "python"];
  for (const cmd of candidates) {
    try {
      const result = spawn(cmd, ["-c", "import dokumen_pintar; print('ok')"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      result.on("error", () => {}); // suppress ENOENT
      result.on("exit", (code) => {
        if (code === 0) { pythonAvailable = true; pythonCmd = cmd; }
      });
      return;
    } catch {}
  }
}

checkPython();

// 根路径 - API 文档
app.get("/", (req, res) => {
  res.json({
    service: "vdi-documents",
    version: "1.0.0",
    description: "VDI 文档服务",
    python_available: pythonAvailable,
    endpoints: {
      "GET  /health": "健康检查",
      "POST /api/compose": "文档生成 (body: {format?, content, title?})",
      "POST /api/read": "文件读取 (body: {file_path})",
      "POST /api/list": "文件列表 (body: {dir_path?})",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "vdi-documents",
    version: "1.0.0",
    python_available: pythonAvailable,
    python_cmd: pythonCmd,
    timestamp: new Date().toISOString(),
  });
});

// 文档生成（通过 Python 子进程）
app.post("/api/compose", (req, res) => {
  if (!pythonAvailable) {
    return res.status(503).json({ error: "Python/dokumen-pintar not available in this container" });
  }
  try {
    const { format = "docx", content, title } = req.body;
    const outputPath = path.join(PROJECT_ROOT, "workspaces", "output", `${title || "document"}.${format}`);

    const child = spawn(pythonCmd, ["-m", "dokumen_pintar", "compose", "--format", format, "--output", outputPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", d => stdout += d);
    child.stderr.on("data", d => stderr += d);

    child.on("exit", (code) => {
      if (code === 0) {
        res.json({ success: true, output_path: outputPath, format });
      } else {
        res.status(500).json({ error: "Document generation failed", stderr });
      }
    });

    if (content) child.stdin.write(content);
    child.stdin.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 文件读取
app.post("/api/read", (req, res) => {
  try {
    const { file_path } = req.body;
    if (!file_path) return res.status(400).json({ error: "file_path required" });
    const fullPath = path.resolve(PROJECT_ROOT, file_path);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File not found" });
    const content = fs.readFileSync(fullPath, "utf8");
    res.json({ file_path, content, size: content.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 文件列表
app.post("/api/list", (req, res) => {
  try {
    const { dir_path = "." } = req.body;
    const fullPath = path.resolve(PROJECT_ROOT, dir_path);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Directory not found" });
    const files = fs.readdirSync(fullPath).map(f => {
      const fp = path.join(fullPath, f);
      const stat = fs.statSync(fp);
      return { name: f, is_directory: stat.isDirectory(), size: stat.size, modified: stat.mtime };
    });
    res.json({ directory: dir_path, files });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
  console.log(`[http-gateway] VDI Documents 服务已启动: http://localhost:${PORT}`);
});
