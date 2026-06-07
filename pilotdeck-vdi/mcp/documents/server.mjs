#!/usr/bin/env node
/**
 * VDI 文档处理 MCP（stdio）— documents 插件
 * =============================================
 * 包装 Dokumen-Pintar Python MCP 服务，使其成为 PilotDeck 系统的一部分。
 * 提供 Word/Excel/PDF 的导出与解读能力。
 *
 * 工具（由 Dokumen-Pintar 提供，此处列出核心能力）：
 *   - content_read / content_write        — 文件读写
 *   - compose_docx / compose_pdf           — 文档生成
 *   - compose_from_markdown                — Markdown 转 Word/PDF
 *   - structured_get / structured_set      — 结构化访问（单元格、段落、页码）
 *   - search_in_format                     — 文档内搜索
 *   - file_create / file_copy / file_move  — 文件管理
 *   - version_list / version_restore       — 版本管理
 *
 * 依赖：
 *   - Python 3.10+
 *   - pip install dokumen-pintar
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// 配置
// ============================================================

// 项目根目录（作为 Dokumen-Pintar 的工作空间根）
const PROJECT_ROOT = path.resolve(__dirname, "../../..");

// Dokumen-Pintar 启动参数
const DP_ARGS = [
  "--transport", "stdio",
  "--root", `project:${PROJECT_ROOT}:rw`,
];

// ============================================================
// Python 环境检测
// ============================================================

function findPython() {
  const candidates = ["python3", "python"];
  for (const cmd of candidates) {
    try {
      const result = spawn(cmd, ["-c", "import dokumen_pintar; print('ok')"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      // 如果能启动就用这个
      return cmd;
    } catch {}
  }
  return null;
}

// ============================================================
// 启动 Dokumen-Pintar 子进程
// ============================================================

function main() {
  const pythonCmd = findPython();
  if (!pythonCmd) {
    console.error("[vdi-documents] 错误: 未找到 Python 或 dokumen-pintar 未安装");
    console.error("[vdi-documents] 请执行: pip install dokumen-pintar");
    process.exit(1);
  }

  // 检查 dokumen-pintar 是否可用
  const checkProc = spawn(pythonCmd, ["-c", "import dokumen_pintar; print(dokumen_pintar.__version__)"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let version = "unknown";
  checkProc.stdout.on("data", (d) => { version = d.toString().trim(); });
  checkProc.stderr.on("data", (d) => { process.stderr.write(d); });

  checkProc.on("close", (code) => {
    if (code !== 0) {
      console.error("[vdi-documents] 错误: dokumen-pintar 导入失败，请执行 pip install dokumen-pintar");
      process.exit(1);
    }

    console.error(`[vdi-documents] 启动 Dokumen-Pintar v${version}`);
    console.error(`[vdi-documents] 工作空间: ${PROJECT_ROOT}`);

    // 启动 Dokumen-Pintar MCP 服务
    const child = spawn(pythonCmd, ["-m", "dokumen_pintar", ...DP_ARGS], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // 桥接 stdio：Cursor <-> Dokumen-Pintar
    process.stdin.pipe(child.stdin);
    child.stdout.pipe(process.stdout);

    // stderr 用于日志
    child.stderr.on("data", (data) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[dokumen-pintar] ${msg}`);
    });

    child.on("close", (code) => {
      console.error(`[vdi-documents] Dokumen-Pintar 退出，代码: ${code}`);
      process.exit(code || 0);
    });

    child.on("error", (err) => {
      console.error(`[vdi-documents] 启动失败: ${err.message}`);
      process.exit(1);
    });

    // 优雅关闭
    process.on("SIGINT", () => child.kill("SIGINT"));
    process.on("SIGTERM", () => child.kill("SIGTERM"));
  });
}

main();
