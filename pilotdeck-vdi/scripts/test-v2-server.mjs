#!/usr/bin/env node
/**
 * VDI 知识库 V2 — 快速功能测试
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const SERVER = "pilotdeck-vdi/mcp/vdi-knowledge/server-v2.mjs";

function call(tool, args = {}) {
  const input = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: tool, arguments: args },
  });

  try {
    const result = execSync(`echo '${input.replace(/'/g, "'\\''")}' | node ${SERVER} 2>/dev/null`, {
      encoding: "utf8",
      timeout: 10000,
    });
    // Parse the JSON-RPC response
    const lines = result.trim().split("\n");
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.result) return parsed.result;
      } catch {}
    }
    return result;
  } catch (e) {
    return { error: String(e) };
  }
}

console.log("=== VDI Knowledge V2 功能测试 ===\n");

// Test 1: 基础搜索
console.log("1. vdi_search_knowledge — 消防给水管径");
const r1 = call("vdi_search_knowledge", { query: "消防给水管径要求", limit: 3 });
const r1j = typeof r1 === "string" ? JSON.parse(r1.match(/\{[\s\S]*\}/)?.[0] || "{}") : r1;
if (r1j.content) {
  const data = JSON.parse(r1j.content[0].text);
  console.log(`   ✓ 查询类型: ${data.query_type}`);
  console.log(`   ✓ 结果数: ${data.count}`);
  data.results?.slice(0, 3).forEach((r, i) => {
    console.log(`   ${i+1}. ${r.evidence_tag} (相关度: ${r.relevance})`);
  });
} else {
  console.log(`   ✗ 失败: ${JSON.stringify(r1j).substring(0, 100)}`);
}

// Test 2: 精确查找
console.log("\n2. vdi_search_by_entity — GB 50160");
const r2 = call("vdi_search_by_entity", { source_id: "GB 50160-2008" });
const r2j = typeof r2 === "string" ? JSON.parse(r2.match(/\{[\s\S]*\}/)?.[0] || "{}") : r2;
if (r2j.content) {
  const data = JSON.parse(r2j.content[0].text);
  console.log(`   ✓ ${data.source_id}: ${data.count} 条条款`);
  data.results?.slice(0, 3).forEach(r => {
    console.log(`   - ${r.evidence_tag}`);
  });
}

// Test 3: 引用获取
console.log("\n3. vdi_get_citation — GB 50974-2014 §7.2.1");
const r3 = call("vdi_get_citation", { source_id: "GB 50974-2014", clause: "7.2.1" });
const r3j = typeof r3 === "string" ? JSON.parse(r3.match(/\{[\s\S]*\}/)?.[0] || "{}") : r3;
if (r3j.content) {
  const data = JSON.parse(r3j.content[0].text);
  console.log(`   ✓ 来源: ${data.source_id} ${data.evidence_tag}`);
  console.log(`   ✓ 强制性: ${data.mandatory}`);
  console.log(`   ✓ 内容: ${(data.content || "").substring(0, 80)}...`);
}

// Test 4: 跨引用解析
console.log("\n4. vdi_resolve_cross_refs");
const r4 = call("vdi_resolve_cross_refs", {
  clause_id: clauses.find(c => c.outgoing_refs?.length > 0)?.clause_id || "",
});
console.log(`   (需要先 search 获取 clause_id)`);

// Test 5: 规范清单
console.log("\n5. vdi_list_standards — water专业");
const r5 = call("vdi_list_standards", { discipline: "water" });
try {
  const r5j = typeof r5 === "string" ? JSON.parse(r5.match(/\{[\s\S]*\}/)?.[0] || "{}") : r5;
  if (r5j.content) {
    const data = JSON.parse(r5j.content[0].text);
    console.log(`   ✓ ${data.discipline} 专业: ${data.total_standards} 个规范, ${data.total_clauses} 条条款`);
    data.standards?.slice(0, 5).forEach(s => {
      console.log(`   - ${s.source_id}: ${s.clause_count}条 (强制: ${s.mandatory_count})`);
    });
  }
} catch (e) {
  console.log(`   ✗ 解析失败: ${e.message}`);
}

console.log("\n=== 测试完成 ===");
