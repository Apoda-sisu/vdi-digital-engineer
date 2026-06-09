#!/usr/bin/env node
/**
 * VDI 系统集成测试
 * ================
 * 测试多专业协作场景，验证系统整体功能
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const WORKSPACE_ROOT = path.join(ROOT, "workspaces");
const FORMULAS_DIR = path.join(ROOT, "pilotdeck-vdi/data/formulas");
const SKILLS_DIR = path.join(ROOT, "skills");

// 测试结果收集
const testResults = {
  formulaLibrary: {},
  skillConfiguration: {},
  eventBus: {},
  knowledgeBase: {},
  integration: {}
};

// 公式库测试
async function testFormulaLibrary() {
  console.log("\n=== 公式库测试 ===");
  
  const results = {
    totalFormulas: 0,
    disciplines: {},
    categories: {},
    types: {},
    validation: []
  };
  
  // 读取公式索引
  const indexFile = path.join(FORMULAS_DIR, "index.json");
  if (fs.existsSync(indexFile)) {
    const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    results.totalFormulas = index.stats.total_formulas;
    results.disciplines = index.stats.disciplines;
    results.categories = index.stats.categories;
    results.types = index.stats.types;
    
    console.log(`✅ 公式库加载成功: ${results.totalFormulas} 个公式`);
    console.log(`专业分布: ${JSON.stringify(results.disciplines, null, 2)}`);
    
    // 验证公式完整性
    let validCount = 0;
    let invalidCount = 0;
    
    for (const formula of index.formulas.slice(0, 10)) { // 只检查前10个
      const formulaFile = path.join(FORMULAS_DIR, formula.file);
      if (fs.existsSync(formulaFile)) {
        try {
          const formulaData = JSON.parse(fs.readFileSync(formulaFile, "utf8"));
          const formulaDetail = formulaData.formulas?.find(f => f.formula_id === formula.id);
          
          if (formulaDetail && formulaDetail.equation_ast && formulaDetail.variables) {
            validCount++;
          } else {
            invalidCount++;
            results.validation.push({
              id: formula.id,
              status: "invalid",
              reason: "缺少必要字段"
            });
          }
        } catch (err) {
          invalidCount++;
          results.validation.push({
            id: formula.id,
            status: "error",
            reason: err.message
          });
        }
      } else {
        invalidCount++;
        results.validation.push({
          id: formula.id,
          status: "missing",
          reason: "文件不存在"
        });
      }
    }
    
    console.log(`公式验证: ${validCount} 有效, ${invalidCount} 无效`);
  } else {
    console.log("❌ 公式索引文件不存在");
  }
  
  testResults.formulaLibrary = results;
  return results;
}

// Skill配置测试
async function testSkillConfiguration() {
  console.log("\n=== Skill 配置测试 ===");
  
  const results = {
    totalSkills: 0,
    disciplines: {},
    levels: {},
    mcpDependencies: {},
    validation: []
  };
  
  // 读取Skill索引
  const indexFile = path.join(SKILLS_DIR, "index.json");
  if (fs.existsSync(indexFile)) {
    const index = JSON.parse(fs.readFileSync(indexFile, "utf8"));
    results.totalSkills = index.total;
    
    console.log(`✅ Skill索引加载成功: ${results.totalSkills} 个Skill`);
    
    // 分析Skill配置
    for (const skill of index.skills) {
      // 统计专业
      const disc = skill.discipline || "unknown";
      results.disciplines[disc] = (results.disciplines[disc] || 0) + 1;
      
      // 统计层级
      const level = skill.level || 0;
      results.levels[level] = (results.levels[level] || 0) + 1;
      
      // 统计MCP依赖
      for (const mcp of skill.mcp_required || []) {
        results.mcpDependencies[mcp] = (results.mcpDependencies[mcp] || 0) + 1;
      }
      
      // 验证Skill文件
      const skillDir = path.join(SKILLS_DIR, skill.path);
      const skillFile = path.join(skillDir, "SKILL.md");
      
      if (!fs.existsSync(skillFile)) {
        results.validation.push({
          name: skill.name,
          status: "missing",
          reason: "SKILL.md文件不存在"
        });
      }
    }
    
    console.log(`专业分布: ${JSON.stringify(results.disciplines, null, 2)}`);
    console.log(`层级分布: ${JSON.stringify(results.levels, null, 2)}`);
    console.log(`MCP依赖: ${JSON.stringify(results.mcpDependencies, null, 2)}`);
    
    if (results.validation.length > 0) {
      console.log(`⚠️ 发现 ${results.validation.length} 个配置问题`);
    } else {
      console.log(`✅ 所有Skill配置验证通过`);
    }
  } else {
    console.log("❌ Skill索引文件不存在");
  }
  
  testResults.skillConfiguration = results;
  return results;
}

// 事件总线测试
async function testEventBus() {
  console.log("\n=== 事件总线测试 ===");
  
  const results = {
    eventTypes: 0,
    subscribers: 0,
    testEvents: [],
    validation: []
  };
  
  // 读取事件注册表
  const registryFile = path.join(ROOT, "pilotdeck-vdi/mcp/vdi-events/event-registry.json");
  if (fs.existsSync(registryFile)) {
    const registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
    results.eventTypes = Object.keys(registry.event_types).length;
    results.subscribers = Object.keys(registry.subscriber_lookup).length;
    
    console.log(`✅ 事件注册表加载成功`);
    console.log(`事件类型: ${results.eventTypes} 种`);
    console.log(`订阅专业: ${results.subscribers} 个`);
    
    // 验证事件类型定义
    for (const [eventType, definition] of Object.entries(registry.event_types)) {
      if (!definition.description || !definition.produced_by) {
        results.validation.push({
          eventType,
          status: "invalid",
          reason: "缺少必要字段"
        });
      }
    }
    
    // 验证订阅关系
    for (const [discipline, subscription] of Object.entries(registry.subscriber_lookup)) {
      if (!subscription.subscribes_to) {
        results.validation.push({
          discipline,
          status: "invalid",
          reason: "缺少订阅列表"
        });
      }
    }
    
    if (results.validation.length > 0) {
      console.log(`⚠️ 发现 ${results.validation.length} 个配置问题`);
    } else {
      console.log(`✅ 所有事件配置验证通过`);
    }
  } else {
    console.log("❌ 事件注册表文件不存在");
  }
  
  testResults.eventBus = results;
  return results;
}

// 知识库测试
async function testKnowledgeBase() {
  console.log("\n=== 知识库测试 ===");
  
  const results = {
    totalClauses: 0,
    standards: 0,
    crossRefs: 0,
    validation: []
  };
  
  // 检查知识库文件
  const knowledgeDir = path.join(ROOT, "pilotdeck-vdi/data");
  const clausesFile = path.join(knowledgeDir, "knowledge-clauses-v2.json");
  const entityIndexFile = path.join(knowledgeDir, "indices/entity-index.json");
  const crossRefsFile = path.join(knowledgeDir, "indices/cross-refs.json");
  
  if (fs.existsSync(clausesFile)) {
    const clauses = JSON.parse(fs.readFileSync(clausesFile, "utf8"));
    results.totalClauses = clauses.clauses?.length || 0;
    console.log(`✅ 知识库加载成功: ${results.totalClauses} 条条款`);
  } else {
    console.log("⚠️ 知识库文件不存在");
  }
  
  if (fs.existsSync(entityIndexFile)) {
    const entityIndex = JSON.parse(fs.readFileSync(entityIndexFile, "utf8"));
    results.standards = Object.keys(entityIndex.index || {}).length;
    console.log(`实体索引: ${results.standards} 个标准`);
  }
  
  if (fs.existsSync(crossRefsFile)) {
    const crossRefs = JSON.parse(fs.readFileSync(crossRefsFile, "utf8"));
    results.crossRefs = Object.keys(crossRefs.graph?.outgoing || {}).length;
    console.log(`跨引用关系: ${results.crossRefs} 条`);
  }
  
  testResults.knowledgeBase = results;
  return results;
}

// 集成测试
async function testIntegration() {
  console.log("\n=== 系统集成测试 ===");
  
  const results = {
    mcpServices: {},
    workspaceStructure: {},
    configFiles: {},
    validation: []
  };
  
  // 检查MCP服务配置
  const mcpConfigFile = path.join(ROOT, "pilotdeck-vdi/config/mcp.json");
  if (fs.existsSync(mcpConfigFile)) {
    const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigFile, "utf8"));
    results.mcpServices = mcpConfig.mcpServers || {};
    console.log(`✅ MCP配置加载成功: ${Object.keys(results.mcpServices).length} 个服务`);
  } else {
    console.log("⚠️ MCP配置文件不存在");
  }
  
  // 检查工作空间结构
  if (fs.existsSync(WORKSPACE_ROOT)) {
    const workspaces = fs.readdirSync(WORKSPACE_ROOT).filter(f => {
      const fullPath = path.join(WORKSPACE_ROOT, f);
      return fs.statSync(fullPath).isDirectory();
    });
    results.workspaceStructure = workspaces;
    console.log(`工作空间: ${workspaces.length} 个项目目录`);
  }
  
  // 检查配置文件
  const configFiles = [
    "pilotdeck-vdi/config/discipline-codes.json",
    "pilotdeck-vdi/config/mcp.json",
    "skills/index.json"
  ];
  
  for (const configFile of configFiles) {
    const fullPath = path.join(ROOT, configFile);
    if (fs.existsSync(fullPath)) {
      results.configFiles[configFile] = "存在";
    } else {
      results.configFiles[configFile] = "缺失";
      results.validation.push({
        file: configFile,
        status: "missing",
        reason: "配置文件不存在"
      });
    }
  }
  
  console.log(`配置文件检查: ${Object.values(results.configFiles).filter(v => v === "存在").length}/${configFiles.length} 存在`);
  
  if (results.validation.length > 0) {
    console.log(`⚠️ 发现 ${results.validation.length} 个集成问题`);
  } else {
    console.log(`✅ 系统集成验证通过`);
  }
  
  testResults.integration = results;
  return results;
}

// 生成测试报告
function generateReport() {
  console.log("\n=== 测试报告 ===");
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total_tests: 5,
      passed: 0,
      failed: 0,
      warnings: 0
    },
    details: testResults
  };
  
  // 统计结果
  for (const [testName, result] of Object.entries(testResults)) {
    if (result.validation && result.validation.length > 0) {
      report.summary.warnings++;
    } else {
      report.summary.passed++;
    }
  }
  
  // 保存报告
  const reportFile = path.join(ROOT, "pilotdeck-vdi/tests/integration-test-report.json");
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  
  console.log(`\n测试总结:`);
  console.log(`  通过: ${report.summary.passed}`);
  console.log(`  警告: ${report.summary.warnings}`);
  console.log(`  失败: ${report.summary.failed}`);
  console.log(`\n报告已保存: ${reportFile}`);
  
  return report;
}

// 主测试函数
async function runTests() {
  console.log("🚀 VDI 系统集成测试开始");
  console.log(`测试时间: ${new Date().toISOString()}`);
  console.log(`项目根目录: ${ROOT}`);
  
  try {
    // 运行各项测试
    await testFormulaLibrary();
    await testSkillConfiguration();
    await testEventBus();
    await testKnowledgeBase();
    await testIntegration();
    
    // 生成报告
    const report = generateReport();
    
    console.log("\n✅ 系统集成测试完成");
    
    // 返回测试结果
    return report;
    
  } catch (error) {
    console.error("❌ 测试失败:", error);
    process.exit(1);
  }
}

// 运行测试
runTests();