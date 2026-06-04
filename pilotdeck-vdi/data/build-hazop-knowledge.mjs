#!/usr/bin/env node
/**
 * HAZOP 知识库构建脚本
 * 将 HAZOP 分析领域的知识文件转换为 vdi-knowledge 兼容格式
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// HAZOP 知识源文件目录
const HAZOP_KNOWLEDGE_DIR = path.resolve(
  __dirname,
  "../../workspaces/HAZOP分析/knowledge"
);

// 输出文件
const OUTPUT_FILE = path.resolve(__dirname, "hazop-knowledge-clauses.json");

// ============================================================
// 知识提取规则
// ============================================================

const EXTRACTION_RULES = {
  // HAZOP 方法论知识
  "hazop-methodology.md": {
    source_id: "HAZOP方法论",
    source_type: "methodology",
    discipline: "hazop",
    sections: [
      {
        pattern: /### \d+\.\d+ (.+)/g,
        clausePrefix: "章节",
        extractContent: true,
      },
    ],
  },
  // 本质安全知识
  "inherent-safety.md": {
    source_id: "T/CCSAS 044-2023",
    source_type: "standard",
    discipline: "hazop",
    sections: [
      {
        pattern: /### \d+\.\d+ (.+)/g,
        clausePrefix: "条款",
        extractContent: true,
      },
    ],
  },
  // 风险矩阵知识
  "risk-matrix.md": {
    source_id: "风险矩阵",
    source_type: "methodology",
    discipline: "hazop",
    sections: [
      {
        pattern: /### \d+\.\d+ (.+)/g,
        clausePrefix: "章节",
        extractContent: true,
      },
    ],
  },
  // 引导词知识
  "guide-words.md": {
    source_id: "HAZOP引导词",
    source_type: "methodology",
    discipline: "hazop",
    sections: [
      {
        pattern: /### \d+\.\d+ (.+)/g,
        clausePrefix: "章节",
        extractContent: true,
      },
    ],
  },
};

// ============================================================
// HAZOP 领域词典
// ============================================================

const HAZOP_DOMAIN_DICTIONARY = {
  synonyms: {
    HAZOP: ["危险与可操作性分析", "危害与可操作性研究"],
    本质安全: ["inherent safety", "固有安全"],
    引导词: ["guide word", "引导词汇"],
    偏差: ["deviation", "偏离"],
    风险矩阵: ["risk matrix", "风险评估矩阵"],
    SIL: ["安全完整性等级", "Safety Integrity Level"],
    BPCS: ["基本过程控制系统", "Basic Process Control System"],
    SIS: ["安全仪表系统", "Safety Instrumented System"],
    LOPA: ["保护层分析", "Layer of Protection Analysis"],
    PFD: ["失效概率", "Probability of Failure on Demand"],
    PSV: ["安全阀", "Pressure Safety Valve"],
    ESD: ["紧急停车", "Emergency Shutdown"],
  },
  standard_aliases: {
    "IEC 61882": ["IEC61882", "IEC-61882", "HAZOP标准"],
    "SH/T 3240": ["SHT3240", "SH-T-3240", "石化HAZOP规范"],
    "T/CCSAS 044-2023": ["TCCSAS044", "本质安全评估指南"],
    "GB/T 35320": ["GBT35320", "GB-T-35320", "HAZOP应用指南"],
  },
};

// ============================================================
// 从 Markdown 提取条款
// ============================================================

function extractClausesFromMarkdown(content, rule) {
  const clauses = [];
  const lines = content.split("\n");
  let currentSection = "";
  let currentContent = [];
  let clauseIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检测章节标题
    const sectionMatch = line.match(/^### \d+\.\d+ (.+)/);
    if (sectionMatch) {
      // 保存上一个章节
      if (currentSection && currentContent.length > 0) {
        clauses.push({
          clause_id: `hazop-${rule.source_id}-${clauseIndex++}`,
          source_type: rule.source_type,
          source_id: rule.source_id,
          version: "2023",
          discipline: rule.discipline,
          clause: `${rule.sections[0].clausePrefix}：${currentSection}`,
          content: currentContent.join("\n").trim(),
          keywords: extractKeywords(currentSection + " " + currentContent.join(" ")),
          tokens: [],
          is_mandatory: true,
          cross_refs: [],
        });
      }
      currentSection = sectionMatch[1];
      currentContent = [];
    } else if (line.trim() && !line.startsWith("#")) {
      currentContent.push(line);
    }
  }

  // 保存最后一个章节
  if (currentSection && currentContent.length > 0) {
    clauses.push({
      clause_id: `hazop-${rule.source_id}-${clauseIndex++}`,
      source_type: rule.source_type,
      source_id: rule.source_id,
      version: "2023",
      discipline: rule.discipline,
      clause: `${rule.sections[0].clausePrefix}：${currentSection}`,
      content: currentContent.join("\n").trim(),
      keywords: extractKeywords(currentSection + " " + currentContent.join(" ")),
      tokens: [],
      is_mandatory: true,
      cross_refs: [],
    });
  }

  return clauses;
}

// ============================================================
// 提取关键词
// ============================================================

function extractKeywords(text) {
  const keywords = new Set();
  const keywordPatterns = [
    /HAZOP/gi,
    /本质安全/gi,
    /引导词/gi,
    /偏差/gi,
    /风险矩阵/gi,
    /SIL/gi,
    /BPCS/gi,
    /SIS/gi,
    /LOPA/gi,
    /安全阀/gi,
    /紧急停车/gi,
    /强化/gi,
    /替代/gi,
    /缓和/gi,
    /简化/gi,
    /流量/gi,
    /压力/gi,
    /温度/gi,
    /液位/gi,
    /可能性/gi,
    /严重度/gi,
  ];

  for (const pattern of keywordPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        keywords.add(match.toLowerCase());
      }
    }
  }

  return Array.from(keywords);
}

// ============================================================
// 主函数
// ============================================================

function main() {
  console.log("开始构建 HAZOP 知识库...");

  const allClauses = [];

  // 处理每个知识文件
  for (const [filename, rule] of Object.entries(EXTRACTION_RULES)) {
    const filePath = path.join(HAZOP_KNOWLEDGE_DIR, filename);

    if (!fs.existsSync(filePath)) {
      console.warn(`警告：文件不存在 ${filePath}`);
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");
    const clauses = extractClausesFromMarkdown(content, rule);
    allClauses.push(...clauses);
    console.log(`  从 ${filename} 提取了 ${clauses.length} 条条款`);
  }

  // 构建输出数据
  const output = {
    schema_version: 2,
    built_at: new Date().toISOString(),
    knowledge_root: HAZOP_KNOWLEDGE_DIR,
    stats: {
      total_clauses: allClauses.length,
      with_cross_refs: 0,
      mandatory: allClauses.filter((c) => c.is_mandatory).length,
      total_outgoing_refs: 0,
      disciplines: {
        hazop: allClauses.length,
      },
      files_scanned: Object.keys(EXTRACTION_RULES).length,
    },
    domain_dictionary: HAZOP_DOMAIN_DICTIONARY,
    clauses: allClauses,
  };

  // 写入输出文件
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

  console.log(`\n构建完成！`);
  console.log(`  总条款数：${allClauses.length}`);
  console.log(`  输出文件：${OUTPUT_FILE}`);
}

main();
