#!/usr/bin/env node
/**
 * 验证模块间能力匹配脚本
 * 检查Skills、MCP服务、事件总线、公式库、知识库之间的接口匹配
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKILLS_REGISTRY } from "../pilotdeck-vdi/config/skills-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// 读取配置文件
const moduleGraph = JSON.parse(fs.readFileSync(path.join(ROOT, "pilotdeck-vdi/data/module-graph.json"), "utf8"));
const skillIndex = JSON.parse(fs.readFileSync(SKILLS_REGISTRY, "utf8"));
const eventRegistry = JSON.parse(fs.readFileSync(path.join(ROOT, "pilotdeck-vdi/mcp/vdi-events/event-registry.json"), "utf8"));
const formulaIndex = JSON.parse(fs.readFileSync(path.join(ROOT, "pilotdeck-vdi/data/formulas/index.json"), "utf8"));
const knowledgeClauses = JSON.parse(fs.readFileSync(path.join(ROOT, "pilotdeck-vdi/data/knowledge-clauses-v2.json"), "utf8"));

// 统计信息
const stats = {
  totalChecks: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  issues: []
};

// 添加问题
function addIssue(level, category, message, details = null) {
  stats.issues.push({ level, category, message, details });
  if (level === 'error') stats.failed++;
  else if (level === 'warning') stats.warnings++;
  stats.totalChecks++;
}

// 检查通过
function pass(category, message) {
  stats.passed++;
  stats.totalChecks++;
  console.log(`✅ [${category}] ${message}`);
}

// 1. 检查Skill与MCP服务的匹配
function checkSkillMcpMatching() {
  console.log("\n=== 1. 检查Skill与MCP服务的匹配 ===\n");
  
  const mcpServices = new Set();
  moduleGraph.nodes
    .filter(n => n.type === 'mcp')
    .forEach(n => mcpServices.add(n.name));
  
  console.log(`可用MCP服务: ${Array.from(mcpServices).join(', ')}\n`);
  
  for (const skill of skillIndex.skills) {
    const skillNode = moduleGraph.nodes.find(n => n.id === `skill:${skill.group}`);
    if (!skillNode) {
      addIssue('error', 'Skill-MCP', `Skill ${skill.group} 在模块图中不存在`);
      continue;
    }
    
    // 检查mcp_required
    const mcpRequired = skill.mcp_required || [];
    for (const mcp of mcpRequired) {
      if (!mcpServices.has(mcp)) {
        addIssue('error', 'Skill-MCP', `Skill ${skill.group} 依赖的MCP服务 ${mcp} 不存在`);
      } else {
        // 检查模块图中是否有对应的边
        const edge = moduleGraph.edges.find(e => 
          e.from === `skill:${skill.group}` && 
          e.to === `mcp:${mcp}` && 
          e.type === 'SKILL_MCP'
        );
        if (edge) {
          pass('Skill-MCP', `${skill.group} -> ${mcp} 连接正确`);
        } else {
          addIssue('warning', 'Skill-MCP', `Skill ${skill.group} 依赖 ${mcp} 但模块图中缺少连接`);
        }
      }
    }
  }
}

// 2. 检查Skill层级关系
function checkSkillHierarchy() {
  console.log("\n=== 2. 检查Skill层级关系 ===\n");
  
  for (const skill of skillIndex.skills) {
    // 检查manages关系
    if (skill.manages && skill.manages.length > 0) {
      for (const managed of skill.manages) {
        const managedSkill = skillIndex.skills.find(s => s.group === managed);
        if (!managedSkill) {
          addIssue('error', 'Skill层级', `Skill ${skill.group} 管理的 ${managed} 不存在`);
        } else {
          // 检查模块图中是否有SKILL_MANAGES边
          const edge = moduleGraph.edges.find(e => 
            e.from === `skill:${skill.group}` && 
            e.to === `skill:${managed}` && 
            e.type === 'SKILL_MANAGES'
          );
          if (edge) {
            pass('Skill层级', `${skill.group} 管理 ${managed} 连接正确`);
          } else {
            addIssue('warning', 'Skill层级', `${skill.group} 管理 ${managed} 但模块图中缺少SKILL_MANAGES边`);
          }
        }
      }
    }
    
    // 检查reports_to关系
    if (skill.reports_to) {
      const reportsToSkill = skillIndex.skills.find(s => s.group === skill.reports_to);
      if (!reportsToSkill) {
        addIssue('error', 'Skill层级', `Skill ${skill.group} 汇报的 ${skill.reports_to} 不存在`);
      } else {
        // 检查模块图中是否有SKILL_REPORTS_TO边
        const edge = moduleGraph.edges.find(e => 
          e.from === `skill:${skill.group}` && 
          e.to === `skill:${skill.reports_to}` && 
          e.type === 'SKILL_REPORTS_TO'
        );
        if (edge) {
          pass('Skill层级', `${skill.group} 汇报给 ${skill.reports_to} 连接正确`);
        } else {
          addIssue('warning', 'Skill层级', `${skill.group} 汇报给 ${skill.reports_to} 但模块图中缺少SKILL_REPORTS_TO边`);
        }
      }
    }
  }
}

// 3. 检查事件发布/订阅匹配
function checkEventMatching() {
  console.log("\n=== 3. 检查事件发布/订阅匹配 ===\n");
  
  const eventTypes = eventRegistry.event_types || {};
  
  // 检查每个事件的生产者是否存在
  for (const [eventType, event] of Object.entries(eventTypes)) {
    const producers = event.produced_by || [];
    for (const producer of producers) {
      if (producer === '*') continue; // 通配符跳过
      
      const producerSkill = skillIndex.skills.find(s => s.group === producer || s.discipline === producer);
      
      if (!producerSkill) {
        addIssue('warning', '事件匹配', `事件 ${eventType} 的生产者 ${producer} 在Skill中不存在`);
      } else {
        pass('事件匹配', `事件 ${eventType} 生产者 ${producer} 存在`);
      }
    }
    
    // 检查订阅者是否存在
    const subscribers = event.subscribers || [];
    for (const subscriber of subscribers) {
      if (subscriber === '*') continue; // 通配符跳过
      
      const subscriberSkill = skillIndex.skills.find(s => s.group === subscriber || s.discipline === subscriber);
      if (!subscriberSkill) {
        addIssue('warning', '事件匹配', `事件 ${eventType} 的订阅者 ${subscriber} 在Skill中不存在`);
      }
    }
  }
}

// 4. 检查公式库与专业的匹配
function checkFormulaMatching() {
  console.log("\n=== 4. 检查公式库与专业的匹配 ===\n");
  
  const formulaDisciplines = formulaIndex.stats.disciplines || {};
  const skillDisciplines = {};
  
  // 统计Skill的专业分布
  for (const skill of skillIndex.skills) {
    const disc = skill.discipline;
    skillDisciplines[disc] = (skillDisciplines[disc] || 0) + 1;
  }
  
  console.log("Skill专业分布:", skillDisciplines);
  console.log("公式专业分布:", formulaDisciplines);
  
  // 检查是否有专业缺少公式
  for (const [discipline, count] of Object.entries(skillDisciplines)) {
    if (discipline === 'system' || discipline === 'MG' || discipline === 'HAZOP') continue;
    
    const formulaCount = formulaDisciplines[discipline] || 0;
    if (formulaCount === 0) {
      addIssue('warning', '公式匹配', `专业 ${discipline} 有 ${count} 个Skill但没有公式`);
    } else {
      pass('公式匹配', `专业 ${discipline} 有 ${count} 个Skill和 ${formulaCount} 个公式`);
    }
  }
}

// 5. 检查知识库与专业的匹配
function checkKnowledgeMatching() {
  console.log("\n=== 5. 检查知识库与专业的匹配 ===\n");
  
  const knowledgeDisciplines = knowledgeClauses.stats.disciplines || {};
  const skillDisciplines = {};
  
  // 统计Skill的专业分布
  for (const skill of skillIndex.skills) {
    const disc = skill.discipline;
    skillDisciplines[disc] = (skillDisciplines[disc] || 0) + 1;
  }
  
  console.log("Skill专业分布:", skillDisciplines);
  console.log("知识库专业分布:", knowledgeDisciplines);
  
  // 检查是否有专业缺少知识库条文
  for (const [discipline, count] of Object.entries(skillDisciplines)) {
    if (discipline === 'system' || discipline === 'MG') continue;
    
    const clauseCount = knowledgeDisciplines[discipline] || 0;
    if (clauseCount === 0) {
      addIssue('warning', '知识库匹配', `专业 ${discipline} 有 ${count} 个Skill但没有知识库条文`);
    } else {
      pass('知识库匹配', `专业 ${discipline} 有 ${count} 个Skill和 ${clauseCount} 条知识库条文`);
    }
  }
}

// 6. 检查跨专业提资事件链
function checkCrossDisciplineEvents() {
  console.log("\n=== 6. 检查跨专业提资事件链 ===\n");
  
  const events = eventRegistry.events || [];
  
  // 检查关键提资事件是否存在
  const criticalEvents = [
    'design_basis.updated',
    'discipline_output.published',
    'condition.changed'
  ];
  
  for (const eventType of criticalEvents) {
    const event = events.find(e => e.type === eventType);
    if (event) {
      pass('跨专业提资', `关键事件 ${eventType} 存在`);
      
      // 检查是否有生产者和订阅者
      if (!event.produced_by) {
        addIssue('error', '跨专业提资', `事件 ${eventType} 缺少生产者`);
      }
      if (!event.subscribers_by_discipline || Object.keys(event.subscribers_by_discipline).length === 0) {
        addIssue('error', '跨专业提资', `事件 ${eventType} 缺少订阅者`);
      }
    } else {
      addIssue('error', '跨专业提资', `关键事件 ${eventType} 不存在`);
    }
  }
}

// 7. 检查MCP服务工具定义
function checkMcpTools() {
  console.log("\n=== 7. 检查MCP服务工具定义 ===\n");
  
  // 检查vdi-knowledge服务的工具
  const knowledgeServerPath = path.join(ROOT, "pilotdeck-vdi/mcp/vdi-knowledge/server-v2.mjs");
  if (fs.existsSync(knowledgeServerPath)) {
    const content = fs.readFileSync(knowledgeServerPath, "utf8");
    
    // 检查关键工具是否存在
    const requiredTools = [
      'vdi_search_knowledge',
      'vdi_get_citation',
      'vdi_search_formulas',
      'vdi_calculate'
    ];
    
    for (const tool of requiredTools) {
      if (content.includes(tool)) {
        pass('MCP工具', `vdi-knowledge 服务包含工具 ${tool}`);
      } else {
        addIssue('error', 'MCP工具', `vdi-knowledge 服务缺少工具 ${tool}`);
      }
    }
  } else {
    addIssue('error', 'MCP工具', `vdi-knowledge 服务文件不存在`);
  }
  
  // 检查vdi-events服务的工具
  const eventsServerPath = path.join(ROOT, "pilotdeck-vdi/mcp/vdi-events/server.mjs");
  if (fs.existsSync(eventsServerPath)) {
    const content = fs.readFileSync(eventsServerPath, "utf8");
    
    const requiredTools = [
      'vdi_publish_event',
      'vdi_consume_pending',
      'vdi_ack_event'
    ];
    
    for (const tool of requiredTools) {
      if (content.includes(tool)) {
        pass('MCP工具', `vdi-events 服务包含工具 ${tool}`);
      } else {
        addIssue('error', 'MCP工具', `vdi-events 服务缺少工具 ${tool}`);
      }
    }
  } else {
    addIssue('error', 'MCP工具', `vdi-events 服务文件不存在`);
  }
}

// 8. 检查Skill与公式的调用关系
function checkSkillFormulaCalls() {
  console.log("\n=== 8. 检查Skill与公式的调用关系 ===\n");
  
  // 读取一些Skill文件检查是否引用了公式
  const skillFiles = fs.readdirSync(path.join(ROOT, "skills"))
    .filter(dir => fs.statSync(path.join(ROOT, "skills", dir)).isDirectory())
    .slice(0, 5); // 只检查前5个
  
  for (const skillDir of skillFiles) {
    const skillPath = path.join(ROOT, "skills", skillDir, "SKILL.md");
    if (fs.existsSync(skillPath)) {
      const content = fs.readFileSync(skillPath, "utf8");
      
      // 检查是否提到了公式或计算
      if (content.includes('公式') || content.includes('计算') || content.includes('formula')) {
        pass('Skill-公式', `Skill ${skillDir} 引用了公式或计算`);
      }
    }
  }
}

// 生成报告
function generateReport() {
  console.log("\n" + "=".repeat(60));
  console.log("模块能力匹配验证报告");
  console.log("=".repeat(60));
  
  console.log(`\n📊 统计信息:`);
  console.log(`   总检查项: ${stats.totalChecks}`);
  console.log(`   通过: ${stats.passed}`);
  console.log(`   失败: ${stats.failed}`);
  console.log(`   警告: ${stats.warnings}`);
  
  if (stats.issues.length > 0) {
    console.log(`\n⚠️ 问题列表:`);
    
    const errors = stats.issues.filter(i => i.level === 'error');
    const warnings = stats.issues.filter(i => i.level === 'warning');
    
    if (errors.length > 0) {
      console.log(`\n❌ 错误 (${errors.length}):`);
      for (const issue of errors) {
        console.log(`   - [${issue.category}] ${issue.message}`);
      }
    }
    
    if (warnings.length > 0) {
      console.log(`\n⚠️ 警告 (${warnings.length}):`);
      for (const issue of warnings) {
        console.log(`   - [${issue.category}] ${issue.message}`);
      }
    }
  }
  
  console.log("\n" + "=".repeat(60));
  
  // 保存报告
  const reportPath = path.join(ROOT, "pilotdeck-vdi/tests/module-matching-report.json");
  fs.writeFileSync(reportPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    statistics: {
      total_checks: stats.totalChecks,
      passed: stats.passed,
      failed: stats.failed,
      warnings: stats.warnings
    },
    issues: stats.issues
  }, null, 2));
  
  console.log(`\n💾 报告已保存: ${reportPath}`);
}

// 主函数
function main() {
  console.log("🔍 开始验证模块间能力匹配...\n");
  
  checkSkillMcpMatching();
  checkSkillHierarchy();
  checkEventMatching();
  checkFormulaMatching();
  checkKnowledgeMatching();
  checkCrossDisciplineEvents();
  checkMcpTools();
  checkSkillFormulaCalls();
  
  generateReport();
}

main();