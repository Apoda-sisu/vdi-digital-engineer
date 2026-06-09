#!/usr/bin/env node
/**
 * 跨专业协作流程集成测试
 * =====================
 * 测试工艺 → 管道 → 仪控 → 电气的完整提资链
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../workspaces");
const TEST_PROJECT_ID = "VDI-PILOT-B";
const TEST_WORKSPACE = path.join(WORKSPACE_ROOT, TEST_PROJECT_ID);

// 事件存储目录
const eventsDir = path.join(TEST_WORKSPACE, ".pilotdeck", "projects", TEST_PROJECT_ID, "events");
const inboxDir = path.join(eventsDir, "inbox");
const processedDir = path.join(eventsDir, "processed");

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 生成事件ID
function generateEventId() {
  return `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 保存事件
function saveEvent(event) {
  ensureDir(inboxDir);
  const filePath = path.join(inboxDir, `${event.event_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(event, null, 2));
  return filePath;
}

// 加载事件
function loadEvent(eventId) {
  // 先查inbox
  let filePath = path.join(inboxDir, `${eventId}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  
  // 再查processed
  filePath = path.join(processedDir, `${eventId}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  
  return null;
}

// 移动事件到processed
function moveEventToProcessed(event) {
  ensureDir(processedDir);
  const inboxPath = path.join(inboxDir, `${event.event_id}.json`);
  const processedPath = path.join(processedDir, `${event.event_id}.json`);
  
  fs.writeFileSync(processedPath, JSON.stringify(event, null, 2));
  if (fs.existsSync(inboxPath)) {
    fs.unlinkSync(inboxPath);
  }
}

// 获取订阅者
function getSubscribers(eventType, producer) {
  const subscriberMap = {
    "design_basis.updated": {
      "PR": ["PI", "IN", "EQ", "WA", "HS"],
      "AR": ["WA", "EL", "HV"],
      "SI": ["PI", "WA", "EL"]
    },
    "discipline_output.published": {
      "PR": ["PI", "IN", "EQ", "WA", "HS"],
      "PI": ["IN", "ST"],
      "WA": ["FI", "EL"],
      "IN": ["EL"]
    },
    "condition.changed": {
      "AR": ["WA", "EL", "HV"],
      "EL": ["IN", "EQ", "WA"],
      "SI": ["PI", "WA", "EL"]
    }
  };
  
  return subscriberMap[eventType]?.[producer] || [];
}

// 创建事件
function createEvent(eventType, producer, payload) {
  const eventId = generateEventId();
  return {
    event_id: eventId,
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    producer: producer,
    project_id: TEST_PROJECT_ID,
    schema_version: "1.0.0",
    trace_id: `TRACE-${eventId}`,
    object_refs: [],
    payload: payload,
    subscribers: getSubscribers(eventType, producer),
    acknowledged_by: [],
    status: "pending",
    retry_count: 0
  };
}

// 模拟专业处理器
const DISCIPLINE_HANDLERS = {
  // 工艺专业处理器
  "PR": {
    "design_basis.updated": async (event) => {
      console.log(`[PR] 处理设计基础更新: ${event.payload.basis_items?.length || 0} 项参数`);
      return { success: true, note: "工艺专业已确认设计基础" };
    },
    "discipline_output.published": async (event) => {
      console.log(`[PR] 处理专业输出发布: ${event.payload.output_type}`);
      return { success: true, note: "工艺专业已确认输出" };
    }
  },
  
  // 管道专业处理器
  "PI": {
    "design_basis.updated": async (event) => {
      console.log(`[PI] 处理设计基础更新: ${event.payload.basis_items?.length || 0} 项参数`);
      // 模拟管道设计
      console.log(`[PI] 根据设计基础更新管道规格...`);
      return { success: true, note: "管道专业已确认设计基础" };
    },
    "discipline_output.published": async (event) => {
      console.log(`[PI] 处理专业输出发布: ${event.payload.output_type}`);
      return { success: true, note: "管道专业已确认输出" };
    }
  },
  
  // 仪控专业处理器
  "IN": {
    "design_basis.updated": async (event) => {
      console.log(`[IN] 处理设计基础更新: ${event.payload.basis_items?.length || 0} 项参数`);
      // 模拟仪控设计
      console.log(`[IN] 根据设计基础更新仪表规格...`);
      return { success: true, note: "仪控专业已确认设计基础" };
    },
    "discipline_output.published": async (event) => {
      console.log(`[IN] 处理专业输出发布: ${event.payload.output_type}`);
      return { success: true, note: "仪控专业已确认输出" };
    }
  },
  
  // 电气专业处理器
  "EL": {
    "design_basis.updated": async (event) => {
      console.log(`[EL] 处理设计基础更新: ${event.payload.basis_items?.length || 0} 项参数`);
      return { success: true, note: "电气专业已确认设计基础" };
    },
    "discipline_output.published": async (event) => {
      console.log(`[EL] 处理专业输出发布: ${event.payload.output_type}`);
      return { success: true, note: "电气专业已确认输出" };
    },
    "condition.changed": async (event) => {
      console.log(`[EL] 处理条件变更: ${event.payload.change_type}`);
      return { success: true, note: "电气专业已确认条件变更" };
    }
  },
  
  // 给排水专业处理器
  "WA": {
    "design_basis.updated": async (event) => {
      console.log(`[WA] 处理设计基础更新: ${event.payload.basis_items?.length || 0} 项参数`);
      return { success: true, note: "给排水专业已确认设计基础" };
    },
    "discipline_output.published": async (event) => {
      console.log(`[WA] 处理专业输出发布: ${event.payload.output_type}`);
      return { success: true, note: "给排水专业已确认输出" };
    },
    "condition.changed": async (event) => {
      console.log(`[WA] 处理条件变更: ${event.payload.change_type}`);
      return { success: true, note: "给排水专业已确认条件变更" };
    }
  }
};

// 处理事件
async function processEvent(event) {
  console.log(`\n处理事件: ${event.event_id} (${event.event_type})`);
  console.log(`生产者: ${event.producer}, 订阅者: [${event.subscribers.join(", ")}]`);
  
  for (const subscriber of event.subscribers) {
    const handler = DISCIPLINE_HANDLERS[subscriber]?.[event.event_type];
    if (handler) {
      const result = await handler(event);
      if (result.success) {
        event.acknowledged_by.push(subscriber);
        event.ack_notes = event.ack_notes || {};
        event.ack_notes[subscriber] = result.note;
        console.log(`✅ ${subscriber} 已确认: ${result.note}`);
      } else {
        console.log(`❌ ${subscriber} 处理失败`);
      }
    } else {
      console.log(`⚠️ ${subscriber} 无处理器`);
    }
  }
  
  // 检查是否全部确认
  const allAcked = event.subscribers.every(s => event.acknowledged_by.includes(s));
  if (allAcked) {
    event.status = "processed";
    event.processed_at = new Date().toISOString();
    moveEventToProcessed(event);
    console.log(`✅ 事件 ${event.event_id} 所有订阅者已确认`);
  } else {
    saveEvent(event);
    console.log(`⚠️ 事件 ${event.event_id} 部分订阅者未确认`);
  }
  
  return event;
}

// 测试工艺→管道→仪控→电气提资链
async function testPRtoPItoINtoELChain() {
  console.log("\n=== 测试 1: 工艺→管道→仪控→电气提资链 ===");
  
  // 1. 工艺发布设计基础
  const prBasisEvent = createEvent("design_basis.updated", "PR", {
    object_id: "BASIS-PR-001",
    object_type: "DesignBasis",
    discipline: "PR",
    basis_items: [
      { tag_id: "EQP-R-1001", parameter: "design_pressure", value: 1.6, unit: "MPa" },
      { tag_id: "EQP-R-1001", parameter: "design_temperature", value: 250, unit: "°C" },
      { tag_id: "EQP-R-1001", parameter: "flow_rate", value: 100, unit: "m³/h" }
    ]
  });
  saveEvent(prBasisEvent);
  console.log(`1. 工艺发布设计基础: ${prBasisEvent.event_id}`);
  
  // 2. 管道确认并发布管道设计
  const prResult = await DISCIPLINE_HANDLERS["PI"]["design_basis.updated"](prBasisEvent);
  if (prResult.success) {
    prBasisEvent.acknowledged_by.push("PI");
    console.log(`2. 管道确认: ${prResult.note}`);
    
    // 管道发布管道设计
    const piDesignEvent = createEvent("discipline_output.published", "PI", {
      object_id: "PI-OUTPUT-001",
      object_type: "DisciplineOutput",
      discipline: "PI",
      output_type: "PipingLayout",
      version: "1.0",
      status: "published",
      data: {
        pipe_spec: "A106B",
        diameter: "DN200",
        pressure_rating: "150#"
      }
    });
    saveEvent(piDesignEvent);
    console.log(`3. 管道发布设计: ${piDesignEvent.event_id}`);
    
    // 3. 仪控确认并发布仪控设计
    const piResult = await DISCIPLINE_HANDLERS["IN"]["discipline_output.published"](piDesignEvent);
    if (piResult.success) {
      piDesignEvent.acknowledged_by.push("IN");
      console.log(`4. 仪控确认: ${piResult.note}`);
      
      // 仪控发布仪控设计
      const inDesignEvent = createEvent("discipline_output.published", "IN", {
        object_id: "IN-OUTPUT-001",
        object_type: "DisciplineOutput",
        discipline: "IN",
        output_type: "InstrumentationDiagram",
        version: "1.0",
        status: "published",
        data: {
          instrument_count: 45,
          control_loops: 12,
          safety_systems: 3
        }
      });
      saveEvent(inDesignEvent);
      console.log(`5. 仪控发布设计: ${inDesignEvent.event_id}`);
      
      // 4. 电气确认
      const inResult = await DISCIPLINE_HANDLERS["EL"]["discipline_output.published"](inDesignEvent);
      if (inResult.success) {
        inDesignEvent.acknowledged_by.push("EL");
        console.log(`6. 电气确认: ${inResult.note}`);
      }
    }
  }
  
  // 检查所有事件状态
  console.log("\n--- 提资链完成状态 ---");
  const allEvents = [prBasisEvent];
  for (const event of allEvents) {
    const allAcked = event.subscribers.every(s => event.acknowledged_by.includes(s));
    console.log(`事件 ${event.event_id}: ${allAcked ? "✅ 全部确认" : "⚠️ 部分未确认"}`);
  }
}

// 测试并行提资流程
async function testParallelHandoff() {
  console.log("\n=== 测试 2: 并行提资流程 ===");
  
  // 1. 工艺发布设计基础
  const prBasisEvent = createEvent("design_basis.updated", "PR", {
    object_id: "BASIS-PR-002",
    object_type: "DesignBasis",
    discipline: "PR",
    basis_items: [
      { tag_id: "EQP-R-1002", parameter: "design_pressure", value: 2.5, unit: "MPa" },
      { tag_id: "EQP-R-1002", parameter: "design_temperature", value: 350, unit: "°C" }
    ]
  });
  saveEvent(prBasisEvent);
  console.log(`1. 工艺发布设计基础: ${prBasisEvent.event_id}`);
  
  // 2. 并行处理：管道、仪控、电气同时确认
  console.log(`2. 并行处理: 管道、仪控、电气同时确认...`);
  
  const parallelResults = await Promise.all([
    DISCIPLINE_HANDLERS["PI"]["design_basis.updated"](prBasisEvent),
    DISCIPLINE_HANDLERS["IN"]["design_basis.updated"](prBasisEvent),
    DISCIPLINE_HANDLERS["EL"]["design_basis.updated"](prBasisEvent)
  ]);
  
  // 检查结果
  const subscribers = ["PI", "IN", "EL"];
  for (let i = 0; i < subscribers.length; i++) {
    if (parallelResults[i].success) {
      prBasisEvent.acknowledged_by.push(subscribers[i]);
      console.log(`✅ ${subscribers[i]} 已确认: ${parallelResults[i].note}`);
    }
  }
  
  // 检查是否全部确认
  const allAcked = prBasisEvent.subscribers.every(s => prBasisEvent.acknowledged_by.includes(s));
  if (allAcked) {
    prBasisEvent.status = "processed";
    prBasisEvent.processed_at = new Date().toISOString();
    moveEventToProcessed(prBasisEvent);
    console.log(`✅ 事件 ${prBasisEvent.event_id} 所有订阅者已确认`);
  } else {
    saveEvent(prBasisEvent);
    console.log(`⚠️ 事件 ${prBasisEvent.event_id} 部分订阅者未确认`);
  }
}

// 测试条件变更传播
async function testConditionChangePropagation() {
  console.log("\n=== 测试 3: 条件变更传播 ===");
  
  // 1. 建筑发布防火分区变更
  const archEvent = createEvent("condition.changed", "AR", {
    object_id: "ARCH-002",
    object_type: "ArchitecturalDesign",
    discipline: "AR",
    change_type: "fire_zone_adjustment",
    affected_areas: ["Zone-A", "Zone-B", "Zone-C"],
    new_values: { fire_resistance_rating: "一级", building_volume: 35000 }
  });
  saveEvent(archEvent);
  console.log(`1. 建筑发布防火分区变更: ${archEvent.event_id}`);
  
  // 2. 相关专业处理
  console.log(`2. 相关专业处理变更...`);
  
  // 给排水处理
  const waHandler = DISCIPLINE_HANDLERS["WA"]["condition.changed"];
  if (waHandler) {
    const waResult = await waHandler(archEvent);
    if (waResult.success) {
      archEvent.acknowledged_by.push("WA");
      console.log(`✅ 给排水已确认: ${waResult.note}`);
    }
  } else {
    console.log(`⚠️ 给排水无处理器`);
  }
  
  // 电气处理
  const elResult = await DISCIPLINE_HANDLERS["EL"]["condition.changed"](archEvent);
  if (elResult.success) {
    archEvent.acknowledged_by.push("EL");
    console.log(`✅ 电气已确认: ${elResult.note}`);
  }
  
  // 检查是否全部确认
  const allAcked = archEvent.subscribers.every(s => archEvent.acknowledged_by.includes(s));
  if (allAcked) {
    archEvent.status = "processed";
    archEvent.processed_at = new Date().toISOString();
    moveEventToProcessed(archEvent);
    console.log(`✅ 事件 ${archEvent.event_id} 所有订阅者已确认`);
  } else {
    saveEvent(archEvent);
    console.log(`⚠️ 事件 ${archEvent.event_id} 部分订阅者未确认`);
  }
}

// 测试事件状态监控
async function testEventStatusMonitoring() {
  console.log("\n=== 测试 4: 事件状态监控 ===");
  
  // 统计inbox
  let inboxCount = 0;
  if (fs.existsSync(inboxDir)) {
    inboxCount = fs.readdirSync(inboxDir).filter(f => f.endsWith(".json")).length;
  }
  
  // 统计processed
  let processedCount = 0;
  if (fs.existsSync(processedDir)) {
    processedCount = fs.readdirSync(processedDir).filter(f => f.endsWith(".json")).length;
  }
  
  console.log(`📊 事件状态统计:`);
  console.log(`   Inbox: ${inboxCount} 条`);
  console.log(`   Processed: ${processedCount} 条`);
  console.log(`   健康状态: ${inboxCount > 10 ? "忙碌" : "正常"}`);
  
  // 列出最近的事件
  if (fs.existsSync(inboxDir)) {
    const inboxFiles = fs.readdirSync(inboxDir).filter(f => f.endsWith(".json"));
    if (inboxFiles.length > 0) {
      console.log(`\n最近待处理事件:`);
      for (const file of inboxFiles.slice(0, 3)) {
        const event = JSON.parse(fs.readFileSync(path.join(inboxDir, file), "utf8"));
        console.log(`  - ${event.event_id}: ${event.event_type} from ${event.producer}`);
      }
    }
  }
  
  if (fs.existsSync(processedDir)) {
    const processedFiles = fs.readdirSync(processedDir).filter(f => f.endsWith(".json"));
    if (processedFiles.length > 0) {
      console.log(`\n最近已处理事件:`);
      for (const file of processedFiles.slice(-3)) {
        const event = JSON.parse(fs.readFileSync(path.join(processedDir, file), "utf8"));
        console.log(`  - ${event.event_id}: ${event.event_type} from ${event.producer}`);
      }
    }
  }
  
  return { inboxCount, processedCount };
}

// 主测试函数
async function runTests() {
  console.log("🚀 跨专业协作流程集成测试开始");
  console.log(`测试项目: ${TEST_PROJECT_ID}`);
  console.log(`工作空间: ${TEST_WORKSPACE}`);
  
  try {
    // 清理测试环境
    if (fs.existsSync(eventsDir)) {
      fs.rmSync(eventsDir, { recursive: true, force: true });
      console.log("🧹 已清理测试环境");
    }
    
    // 运行测试
    await testPRtoPItoINtoELChain();
    await testParallelHandoff();
    await testConditionChangePropagation();
    await testEventStatusMonitoring();
    
    console.log("\n✅ 所有测试完成");
    
  } catch (error) {
    console.error("❌ 测试失败:", error);
    process.exit(1);
  }
}

// 运行测试
runTests();