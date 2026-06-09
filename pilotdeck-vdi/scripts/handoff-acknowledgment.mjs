#!/usr/bin/env node
/**
 * 提资确认机制自动化脚本
 * =====================
 * 实现跨专业提资的自动确认和跟踪
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../workspaces");

// 提资状态常量
const HANDOFF_STATUS = {
  PENDING: "pending",
  PUBLISHED: "published",
  ACKNOWLEDGED: "acknowledged",
  REJECTED: "rejected",
  COMPLETED: "completed"
};

// 提资类型
const HANDOFF_TYPES = {
  DESIGN_BASIS: "design_basis",
  DISCIPLINE_OUTPUT: "discipline_output",
  CONDITION_CHANGE: "condition_change",
  PROCUREMENT: "procurement"
};

// 提资确认记录类
class HandoffRecord {
  constructor(handoffId, sourceDiscipline, targetDiscipline, handoffType, data) {
    this.handoff_id = handoffId;
    this.source_discipline = sourceDiscipline;
    this.target_discipline = targetDiscipline;
    this.handoff_type = handoffType;
    this.status = HANDOFF_STATUS.PENDING;
    this.created_at = new Date().toISOString();
    this.published_at = null;
    this.acknowledged_at = null;
    this.completed_at = null;
    this.data = data;
    this.acknowledgments = [];
    this.rejection_reason = null;
    this.metadata = {};
  }

  // 发布提资
  publish() {
    this.status = HANDOFF_STATUS.PUBLISHED;
    this.published_at = new Date().toISOString();
    return this;
  }

  // 确认提资
  acknowledge(discipline, userId, note) {
    this.acknowledgments.push({
      discipline,
      user_id: userId,
      note,
      acknowledged_at: new Date().toISOString()
    });

    // 检查是否所有目标专业都已确认
    const targetDisciplines = Array.isArray(this.target_discipline) 
      ? this.target_discipline 
      : [this.target_discipline];
    
    const allAcknowledged = targetDisciplines.every(
      target => this.acknowledgments.some(ack => ack.discipline === target)
    );

    if (allAcknowledged) {
      this.status = HANDOFF_STATUS.ACKNOWLEDGED;
      this.acknowledged_at = new Date().toISOString();
    }

    return this;
  }

  // 拒绝提资
  reject(discipline, userId, reason) {
    this.status = HANDOFF_STATUS.REJECTED;
    this.rejection_reason = {
      discipline,
      user_id: userId,
      reason,
      rejected_at: new Date().toISOString()
    };
    return this;
  }

  // 完成提资
  complete() {
    this.status = HANDOFF_STATUS.COMPLETED;
    this.completed_at = new Date().toISOString();
    return this;
  }

  // 获取状态摘要
  getSummary() {
    return {
      handoff_id: this.handoff_id,
      source: this.source_discipline,
      target: this.target_discipline,
      type: this.handoff_type,
      status: this.status,
      created_at: this.created_at,
      published_at: this.published_at,
      acknowledged_at: this.acknowledged_at,
      completed_at: this.completed_at,
      acknowledgment_count: this.acknowledgments.length,
      rejection_reason: this.rejection_reason
    };
  }
}

// 提资确认管理器
class HandoffManager {
  constructor(projectId) {
    this.project_id = projectId;
    this.workspace = path.join(WORKSPACE_ROOT, projectId);
    this.handoffs = new Map();
    this.handoffs_dir = path.join(this.workspace, ".pilotdeck", "projects", projectId, "handoffs");
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [
      this.handoffs_dir,
      path.join(this.handoffs_dir, "pending"),
      path.join(this.handoffs_dir, "acknowledged"),
      path.join(this.handoffs_dir, "rejected"),
      path.join(this.handoffs_dir, "completed")
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // 生成提资ID
  generateHandoffId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `HO-${timestamp}-${random}`;
  }

  // 创建提资记录
  createHandoff(sourceDiscipline, targetDiscipline, handoffType, data) {
    const handoffId = this.generateHandoffId();
    const handoff = new HandoffRecord(
      handoffId,
      sourceDiscipline,
      targetDiscipline,
      handoffType,
      data
    );

    this.handoffs.set(handoffId, handoff);
    this.saveHandoff(handoff);

    console.log(`[提资管理] 创建提资: ${handoffId}`);
    console.log(`  来源: ${sourceDiscipline} -> 目标: ${targetDiscipline}`);
    console.log(`  类型: ${handoffType}`);

    return handoff;
  }

  // 发布提资
  publishHandoff(handoffId) {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`提资记录不存在: ${handoffId}`);
    }

    handoff.publish();
    this.saveHandoff(handoff);

    console.log(`[提资管理] 发布提资: ${handoffId}`);
    console.log(`  状态: ${handoff.status}`);
    console.log(`  发布时间: ${handoff.published_at}`);

    return handoff;
  }

  // 确认提资
  acknowledgeHandoff(handoffId, discipline, userId, note) {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`提资记录不存在: ${handoffId}`);
    }

    if (handoff.status === HANDOFF_STATUS.REJECTED) {
      throw new Error(`提资已被拒绝: ${handoffId}`);
    }

    handoff.acknowledge(discipline, userId, note);
    this.saveHandoff(handoff);

    console.log(`[提资管理] 确认提资: ${handoffId}`);
    console.log(`  确认专业: ${discipline}`);
    console.log(`  用户: ${userId}`);
    console.log(`  确认数量: ${handoff.acknowledgments.length}`);

    if (handoff.status === HANDOFF_STATUS.ACKNOWLEDGED) {
      console.log(`✅ 所有目标专业已确认`);
    }

    return handoff;
  }

  // 拒绝提资
  rejectHandoff(handoffId, discipline, userId, reason) {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`提资记录不存在: ${handoffId}`);
    }

    handoff.reject(discipline, userId, reason);
    this.saveHandoff(handoff);

    console.log(`[提资管理] 拒绝提资: ${handoffId}`);
    console.log(`  拒绝专业: ${discipline}`);
    console.log(`  原因: ${reason}`);

    return handoff;
  }

  // 完成提资
  completeHandoff(handoffId) {
    const handoff = this.handoffs.get(handoffId);
    if (!handoff) {
      throw new Error(`提资记录不存在: ${handoffId}`);
    }

    if (handoff.status !== HANDOFF_STATUS.ACKNOWLEDGED) {
      throw new Error(`提资状态不是已确认: ${handoffId}`);
    }

    handoff.complete();
    this.saveHandoff(handoff);

    console.log(`[提资管理] 完成提资: ${handoffId}`);
    console.log(`  完成时间: ${handoff.completed_at}`);

    return handoff;
  }

  // 保存提资记录
  saveHandoff(handoff) {
    const statusDir = path.join(this.handoffs_dir, handoff.status);
    const filePath = path.join(statusDir, `${handoff.handoff_id}.json`);
    
    // 确保目录存在
    if (!fs.existsSync(statusDir)) {
      fs.mkdirSync(statusDir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(handoff.getSummary(), null, 2));
    
    // 从旧状态目录删除
    for (const status of Object.values(HANDOFF_STATUS)) {
      if (status !== handoff.status) {
        const oldPath = path.join(this.handoffs_dir, status, `${handoff.handoff_id}.json`);
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
    }
  }

  // 加载提资记录
  loadHandoff(handoffId) {
    // 从所有状态目录查找
    for (const status of Object.values(HANDOFF_STATUS)) {
      const filePath = path.join(this.handoffs_dir, status, `${handoffId}.json`);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const handoff = new HandoffRecord(
          data.handoff_id,
          data.source_discipline,
          data.target_discipline,
          data.handoff_type,
          data.data
        );
        
        Object.assign(handoff, data);
        this.handoffs.set(handoffId, handoff);
        return handoff;
      }
    }
    
    return null;
  }

  // 获取所有待确认的提资
  getPendingHandoffs() {
    const pendingDir = path.join(this.handoffs_dir, "pending");
    if (!fs.existsSync(pendingDir)) {
      return [];
    }

    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith(".json"));
    return files.map(file => {
      const data = JSON.parse(fs.readFileSync(path.join(pendingDir, file), "utf8"));
      return data;
    });
  }

  // 获取指定专业的待确认提资
  getPendingHandoffsForDiscipline(discipline) {
    const pending = this.getPendingHandoffs();
    return pending.filter(handoff => {
      const targets = Array.isArray(handoff.target_discipline) 
        ? handoff.target_discipline 
        : [handoff.target_discipline];
      return targets.includes(discipline);
    });
  }

  // 获取提资统计
  getStatistics() {
    const stats = {
      total: 0,
      pending: 0,
      published: 0,
      acknowledged: 0,
      rejected: 0,
      completed: 0,
      by_discipline: {},
      by_type: {}
    };

    for (const status of Object.values(HANDOFF_STATUS)) {
      const statusDir = path.join(this.handoffs_dir, status);
      if (fs.existsSync(statusDir)) {
        const files = fs.readdirSync(statusDir).filter(f => f.endsWith(".json"));
        stats[status] = files.length;
        stats.total += files.length;

        for (const file of files) {
          const data = JSON.parse(fs.readFileSync(path.join(statusDir, file), "utf8"));
          
          // 按专业统计
          const discipline = data.source_discipline;
          stats.by_discipline[discipline] = (stats.by_discipline[discipline] || 0) + 1;
          
          // 按类型统计
          const type = data.handoff_type;
          stats.by_type[type] = (stats.by_type[type] || 0) + 1;
        }
      }
    }

    return stats;
  }

  // 生成提资报告
  generateReport() {
    const stats = this.getStatistics();
    
    const report = {
      project_id: this.project_id,
      generated_at: new Date().toISOString(),
      statistics: stats,
      pending_handoffs: this.getPendingHandoffs()
    };

    return report;
  }
}

// 自动化提资流程
class HandoffAutomation {
  constructor(projectId) {
    this.project_id = projectId;
    this.manager = new HandoffManager(projectId);
    this.workflows = new Map();
  }

  // 注册工作流
  registerWorkflow(workflowId, workflow) {
    this.workflows.set(workflowId, workflow);
    console.log(`[自动化] 注册工作流: ${workflowId}`);
  }

  // 执行工作流
  async executeWorkflow(workflowId, inputs) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`工作流不存在: ${workflowId}`);
    }

    console.log(`[自动化] 执行工作流: ${workflowId}`);
    
    try {
      const result = await workflow.execute(inputs, this.manager);
      console.log(`[自动化] 工作流完成: ${workflowId}`);
      return result;
    } catch (error) {
      console.error(`[自动化] 工作流失败: ${workflowId}`, error);
      throw error;
    }
  }

  // 创建工艺提资工作流
  createProcessHandoffWorkflow() {
    return {
      name: "工艺专业提资流程",
      description: "工艺专业向下游专业提资的自动化流程",
      execute: async (inputs, manager) => {
        const { sourceDiscipline, targetDisciplines, data } = inputs;
        
        console.log("\n=== 开始工艺专业提资流程 ===");
        
        // 1. 创建提资记录
        const handoff = manager.createHandoff(
          sourceDiscipline,
          targetDisciplines,
          HANDOFF_TYPES.DESIGN_BASIS,
          data
        );
        
        // 2. 发布提资
        manager.publishHandoff(handoff.handoff_id);
        
        // 3. 等待确认（模拟）
        console.log("\n[流程] 等待下游专业确认...");
        
        // 模拟确认过程
        for (const target of targetDisciplines) {
          await new Promise(resolve => setTimeout(resolve, 100));
          manager.acknowledgeHandoff(
            handoff.handoff_id,
            target,
            `user_${target.toLowerCase()}`,
            `${target}专业已确认`
          );
        }
        
        // 4. 完成提资
        manager.completeHandoff(handoff.handoff_id);
        
        console.log("\n=== 工艺专业提资流程完成 ===");
        
        return handoff.getSummary();
      }
    };
  }

  // 创建管道提资工作流
  createPipingHandoffWorkflow() {
    return {
      name: "管道专业提资流程",
      description: "管道专业向相关专业提资的自动化流程",
      execute: async (inputs, manager) => {
        const { sourceDiscipline, targetDisciplines, data } = inputs;
        
        console.log("\n=== 开始管道专业提资流程 ===");
        
        // 1. 创建提资记录
        const handoff = manager.createHandoff(
          sourceDiscipline,
          targetDisciplines,
          HANDOFF_TYPES.DISCIPLINE_OUTPUT,
          data
        );
        
        // 2. 发布提资
        manager.publishHandoff(handoff.handoff_id);
        
        // 3. 等待确认
        console.log("\n[流程] 等待相关专业确认...");
        
        for (const target of targetDisciplines) {
          await new Promise(resolve => setTimeout(resolve, 100));
          manager.acknowledgeHandoff(
            handoff.handoff_id,
            target,
            `user_${target.toLowerCase()}`,
            `${target}专业已确认`
          );
        }
        
        // 4. 完成提资
        manager.completeHandoff(handoff.handoff_id);
        
        console.log("\n=== 管道专业提资流程完成 ===");
        
        return handoff.getSummary();
      }
    };
  }

  // 创建条件变更工作流
  createConditionChangeWorkflow() {
    return {
      name: "条件变更通知流程",
      description: "条件变更后通知相关专业的自动化流程",
      execute: async (inputs, manager) => {
        const { sourceDiscipline, changeType, changeData, affectedDisciplines } = inputs;
        
        console.log("\n=== 开始条件变更通知流程 ===");
        
        // 1. 创建变更提资记录
        const handoff = manager.createHandoff(
          sourceDiscipline,
          affectedDisciplines,
          HANDOFF_TYPES.CONDITION_CHANGE,
          {
            change_type: changeType,
            change_data: changeData
          }
        );
        
        // 2. 发布变更通知
        manager.publishHandoff(handoff.handoff_id);
        
        // 3. 等待确认
        console.log("\n[流程] 等待受影响专业确认变更...");
        
        for (const target of affectedDisciplines) {
          await new Promise(resolve => setTimeout(resolve, 100));
          manager.acknowledgeHandoff(
            handoff.handoff_id,
            target,
            `user_${target.toLowerCase()}`,
            `${target}专业已确认变更`
          );
        }
        
        // 4. 完成变更
        manager.completeHandoff(handoff.handoff_id);
        
        console.log("\n=== 条件变更通知流程完成 ===");
        
        return handoff.getSummary();
      }
    };
  }
}

// 主函数：演示提资确认机制
async function main() {
  console.log("🚀 提资确认机制自动化演示开始");
  console.log("项目: VDI-PILOT-B");
  
  const projectId = "VDI-PILOT-B";
  const automation = new HandoffAutomation(projectId);
  
  // 注册工作流
  automation.registerWorkflow("process-handoff", automation.createProcessHandoffWorkflow());
  automation.registerWorkflow("piping-handoff", automation.createPipingHandoffWorkflow());
  automation.registerWorkflow("condition-change", automation.createConditionChangeWorkflow());
  
  try {
    // 1. 执行工艺提资流程
    console.log("\n=== 场景 1: 工艺专业提资 ===");
    await automation.executeWorkflow("process-handoff", {
      sourceDiscipline: "PR",
      targetDisciplines: ["PI", "IN", "EQ", "WA", "HS", "MA", "EL"],
      data: {
        object_id: "BASIS-PR-001",
        basis_items: [
          { tag_id: "EQP-R-1001", parameter: "design_pressure", value: 1.6, unit: "MPa" },
          { tag_id: "EQP-R-1001", parameter: "design_temperature", value: 250, unit: "°C" }
        ]
      }
    });
    
    // 2. 执行管道提资流程
    console.log("\n=== 场景 2: 管道专业提资 ===");
    await automation.executeWorkflow("piping-handoff", {
      sourceDiscipline: "PI",
      targetDisciplines: ["IN", "EL", "ST", "WA", "MA"],
      data: {
        drawing_number: "PL-001",
        revision: "A",
        drawing_type: "piping_layout"
      }
    });
    
    // 3. 执行条件变更流程
    console.log("\n=== 场景 3: 条件变更通知 ===");
    await automation.executeWorkflow("condition-change", {
      sourceDiscipline: "ST",
      changeType: "foundation_load",
      changeData: {
        structure_id: "ST-001",
        old_load: "500 tons",
        new_load: "600 tons"
      },
      affectedDisciplines: ["PI", "WA", "EL", "AR"]
    });
    
    // 4. 生成报告
    console.log("\n=== 生成提资报告 ===");
    const manager = new HandoffManager(projectId);
    const report = manager.generateReport();
    
    console.log(`\n📊 提资统计:`);
    console.log(`  总计: ${report.statistics.total} 条`);
    console.log(`  待确认: ${report.statistics.pending} 条`);
    console.log(`  已确认: ${report.statistics.acknowledged} 条`);
    console.log(`  已拒绝: ${report.statistics.rejected} 条`);
    console.log(`  已完成: ${report.statistics.completed} 条`);
    
    console.log(`\n📈 按专业统计:`);
    for (const [discipline, count] of Object.entries(report.statistics.by_discipline)) {
      console.log(`  ${discipline}: ${count} 条`);
    }
    
    console.log(`\n📊 按类型统计:`);
    for (const [type, count] of Object.entries(report.statistics.by_type)) {
      console.log(`  ${type}: ${count} 条`);
    }
    
    // 保存报告
    const reportPath = path.join(WORKSPACE_ROOT, projectId, ".pilotdeck", "projects", projectId, "handoffs", "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 报告已保存: ${reportPath}`);
    
    console.log("\n✅ 提资确认机制演示完成");
    
  } catch (error) {
    console.error("❌ 演示失败:", error);
    process.exit(1);
  }
}

// 运行演示
main();