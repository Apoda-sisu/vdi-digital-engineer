#!/usr/bin/env node
/**
 * vdi-vision 单元测试（无需 Vision API）
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  getVisionConfig,
  resolveImagePath,
  PROJECT_ROOT,
} from "./vision-client.mjs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

console.log("vdi-vision unit tests\n");

test("getVisionConfig defaults to openai", () => {
  const prev = process.env.VISION_PROVIDER;
  delete process.env.VISION_PROVIDER;
  const cfg = getVisionConfig();
  assert.equal(cfg.provider, "openai");
  assert.ok(cfg.model.includes("gpt") || cfg.model.length > 0);
  if (prev) process.env.VISION_PROVIDER = prev;
});

test("getVisionConfig respects ollama override", () => {
  const cfg = getVisionConfig("ollama");
  assert.equal(cfg.provider, "ollama");
});

test("resolveImagePath rejects path outside project", () => {
  assert.throws(() => resolveImagePath("/etc/passwd"), /项目目录/);
});

test("resolveImagePath rejects missing file", () => {
  assert.throws(
    () => resolveImagePath("uploads/__nonexistent_test__.png"),
    /不存在/
  );
});

test("resolveImagePath rejects unsupported format", () => {
  const tmp = path.join(PROJECT_ROOT, "uploads");
  fs.mkdirSync(tmp, { recursive: true });
  const fake = path.join(tmp, "__test__.txt");
  fs.writeFileSync(fake, "x");
  try {
    assert.throws(() => resolveImagePath("uploads/__test__.txt"), /不支持/);
  } finally {
    fs.unlinkSync(fake);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
