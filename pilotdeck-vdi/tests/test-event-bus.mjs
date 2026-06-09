#!/usr/bin/env node
/**
 * VDI 事件总线集成测试
 * ===================
 * 测试跨专业提资流程：工艺 → 管道 → 仪控 → 电气
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "../../workspaces");

// 测试配置
const TEST_PROJECT_ID = "VDI-PILOT-B";
const TEST_WORKSPACE = path.join(WORKSPACE_ROOT, TEST_PROJECT_ID);

// 模拟事件数据
const TEST_EVENTS = [
  {
    event_type: "design_basis.updated",
    producer: "PR",
    payload: {
      object_id: "BASIS-001",
      object_type: "DesignBasis",
      discipline: "PR",
      basis_items: [
        { tag_id: "EQP-R-1001", parameter: "design_pressure", value: 1.6, unit: "MPa" },
        { tag_id: "EQP-R-1001", parameter: "design_temperature", value: 250, unit: "°C" },
        { tag_id: "EQP-R-1001", parameter: "flow_rate", value: 100, unit: "m³/h" }
      ]
    }
  },
  {
    event_type: "discipline_output.published",
    producer: "PR",
    payload: {
      object_id: "PR-OUTPUT-001",
      object_type: "DisciplineOutput",
      discipline: "PR",
      output_type: "PFD",
      version: "1.0",
      status: "published"
    }
  },
  {
    event_type: "condition.changed",
    producer: "AR",
    payload: {
      object_id: "ARCH-001",
      object_type: "ArchitecturalDesign",
      discipline: "AR",
      change_type: "fire_zone_adjustment",
      affected_areas: ["Zone-A", "Zone-B"],
      new_values: { fire_resistance_rating: "一级", building_volume: 25000 }
    }
  }
];

// 模拟订阅者处理函数
const SUBSCRIBER_HANDLERS = {
  "PI": async (event) => {
    console.log(`[PI] 处理事件: ${event.event_type} from ${event.producer}`);
    if (event.event_type === "design_basis.updated") {
      console.log(`[PI] 更新管道设计基础: ${event.payload.basis_items.length} 项参数`);
    }
    return { success: true, note: "管道专业已确认" };
  },
  "IN": async (event) => {
    console.log(`[IN] 处理事件: ${event.event_type} from ${event.producer}`);
    if (event.event_type === "design_basis.updated") {
      console.log(`[IN] 更新仪控设计基础: ${event.payload.basis_items.length} 项参数`);
    }
    return { success: true, note: "仪控专业已确认" };
  },
  "WA": async (event) => {
    console.log(`[WA] 处理事件: ${event.event_type} from ${event.producer}`);
    if (event.event_type === "design_basis.updated") {
      console.log(`[WA] 更新给排水设计基础: ${event.payload.basis_items.length} 项参数`);
    }
    return { success: true, note: "给排水专业已确认" };
  },
  "EL": async (event) => {
    console.log(`[EL] 处理事件: ${event.event_type} from ${event.producer}`);
    return { success: true, note: "电气专业已确认" };
  }
};

// 测试工具函数
function createTestEvent(eventData) {
  const eventId = `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return {
    event_id: eventId,
    event_type: eventData.event_type,
    occurred_at: new Date().toISOString(),
    producer: eventData.producer,
    project_id: TEST_PROJECT_ID,
    schema_version: "1.0.0",
    trace_id: `TRACE-${eventId}`,
    object_refs: [],
    payload: eventData.payload,
    subscribers: getSubscribers(eventData.event_type, eventData.producer),
    acknowledged_by: [],
    status: "pending",
    retry_count: 0
  };
}

function getSubscribers(eventType, producer) {
  // 根据事件类型和生产者推断订阅者
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

function saveEvent(event) {
  const eventsDir = path.join(TEST_WORKSPACE, ".pilotdeck", "projects", TEST_PROJECT_ID, "events");
  const inboxDir = path.join(eventsDir, "inbox");
  
  if (!fs.existsSync(inboxDir)) {
    fs.mkdirSync(inboxDir, { recursive: true });
  }
  
  const filePath = path.join(inboxDir, `${event.event_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(event, null, 2));
  return filePath;
}

function loadEvent(eventId) {
  const eventsDir = path.join(TEST_WORKSPACE, ".pilotdeck", "projects", TEST_PROJECT_ID, "events");
  const inboxDir = path.join(eventsDir, "inbox");
  const processedDir = path.join(eventsDir, "processed");
  
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

function moveEventToProcessed(event) {
  const eventsDir = path.join(TEST_WORKSPACE, ".pilotdeck", "projects", TEST_PROJECT_ID, "events");
  const inboxDir = path.join(eventsDir, "inbox");
  const processedDir = path.join(eventsDir, "processed");
  
  if (!fs.existsSync(processedDir)) {
    fs.mkdirSync(processedDir, { recursive: true });
  }
  
  const inboxPath = path.join(inboxDir, `${event.event_id}.json`);
  const processedPath = path.join(processedDir, `${event.event_id}.json`);
  
  // 写入processed
  fs.writeFileSync(processedPath, JSON.stringify(event, null, 2));
  
  // 删除inbox
  if (fs.existsSync(inboxPath)) {
    fs.unlinkSync(inboxPath);
  }
}

// 测试用例
async function testEventPublishAndConsume() {
  console.log("\n=== 测试 1: 事件发布与消费 ===");
  
  // 1. 创建并发布事件
  const eventData = TEST_EVENTS[0];
  const event = createTestEvent(eventData);
  saveEvent(event);
  
  console.log(`✅ 事件已发布: ${event.event_id}`);
  console.log(`   类型: ${event.event_type}`);
  console.log(`   生产者: ${event.producer}`);
  console.log(`   订阅者: [${event.subscribers.join(", ")}]`);
  
  // 2. 模拟订阅者消费
  for (const subscriber of event.subscribers) {
    const handler = SUBSCRIBER_HANDLERS[subscriber];
    if (handler) {
      const result = await handler(event);
      if (result.success) {
        event.acknowledged_by.push(subscriber);
        if (result.note) {
          event.ack_notes = event.ack_notes || {};
          event.ack_notes[subscriber] = result.note;
        }
        console.log(`   ✅ ${subscriber} 已确认: ${result.note}`);
      }
    }
  }
  
  // 3. 检查是否全部确认
  const allAcked = event.subscribers.every(s => event.acknowledged_by.includes(s));
  if (allAcked) {
    event.status = "processed";
    event.processed_at = new Date().toISOString();
    moveEventToProcessed(event);
    console.log(`✅ 事件 ${event.event_id} 所有订阅者已确认，已移入processed`);
  } else {
    saveEvent(event);
    console.log(`⚠️ 事件 ${event.event_id} 部分订阅者未确认`);
  }
  
  return event;
}

async function testMultiEventWorkflow() {
  console.log("\n=== 测试 2: 多事件工作流 ===");
  
  const events = [];
  
  // 1. 工艺发布设计基础
  const basisEvent = createTestEvent(TEST_EVENTS[0]);
  saveEvent(basisEvent);
  events.push(basisEvent);
  console.log(`✅ 工艺发布设计基础: ${basisEvent.event_id}`);
  
  // 2. 工艺发布PFD
  const pfdEvent = createTestEvent(TEST_EVENTS[1]);
  saveEvent(pfdEvent);
  events.push(pfdEvent);
  console.log(`✅ 工艺发布PFD: ${pfdEvent.event_id}`);
  
  // 3. 建筑变更防火分区
  const archEvent = createTestEvent(TEST_EVENTS[2]);
  saveEvent(archEvent);
  events.push(archEvent);
  console.log(`✅ 建筑变更防火分区: ${archEvent.event_id}`);
  
  // 4. 模拟各专业处理
  console.log("\n--- 各专业处理事件 ---");
  
  for (const event of events) {
    console.log(`\n处理事件: ${event.event_id} (${event.event_type})`);
    
    for (const subscriber of event.subscribers) {
      const handler = SUBSCRIBER_HANDLERS[subscriber];
      if (handler) {
        const result = await handler(event);
        if (result.success) {
          event.acknowledged_by.push(subscriber);
          event.ack_notes = event.ack_notes || {};
          event.ack_notes[subscriber] = result.note;
        }
      }
    }
    
    // 检查是否全部确认
    const allAcked = event.subscribers.every(s => event.acknowledged_by.includes(s));
    if (allAcked) {
      event.status = "processed";
      event.processed_at = new Date().toISOString();
      moveEventToProcessed(event);
      console.log(`✅ 事件 ${event.event_id} 已全部确认`);
    } else {
      saveEvent(event);
      console.log(`⚠️ 事件 ${event.event_id} 部分未确认`);
    }
  }
  
  return events;
}

async function testEventStatusMonitoring() {
  console.log("\n=== 测试 3: 事件状态监控 ===");
  
  const eventsDir = path.join(TEST_WORKSPACE, ".pilotdeck", "projects", TEST_PROJECT_ID, "events");
  const inboxDir = path.join(eventsDir, "inbox");
  const processedDir = path.join(eventsDir, "processed");
  
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
  
  return { inboxCount, processedCount };
}

async function testCrossDisciplineHandoff() {
  console.log("\n=== 测试 4: 跨专业提资流程 ===");
  
  // 模拟工艺 → 管道 → 仪控 → 电气的提资链
  console.log("模拟提资链: 工艺(PR) → 管道(PI) → 仪控(IN) → 电气(EL)");
  
  // 1. 工艺发布设计基础
  const prEvent = createTestEvent({
    event_type: "design_basis.updated",
    producer: "PR",
    payload: {
      object_id: "BASIS-PR-001",
      object_type: "DesignBasis",
      discipline: "PR",
      basis_items: [
        { tag_id: "EQP-R-1001", parameter: "design_pressure", value: 1.6, unit: "MPa" },
        { tag_id: "EQP-R-1001", parameter: "design_temperature", value: 250, unit: "°C" }
      ]
    }
  });
  saveEvent(prEvent);
  console.log(`1. 工艺发布设计基础: ${prEvent.event_id}`);
  
  // 2. 管道确认并发布管道设计
  const piResult = await SUBSCRIBER_HANDLERS["PI"](prEvent);
  if (piResult.success) {
    prEvent.acknowledged_by.push("PI");
    console.log(`2. 管道确认: ${piResult.note}`);
    
    // 管道发布管道设计
    const piEvent = createTestEvent({
      event_type: "discipline_output.published",
      producer: "PI",
      payload: {
        object_id: "PI-OUTPUT-001",
        object_type: "DisciplineOutput",
        discipline: "PI",
        output_type: "PipingLayout",
        version: "1.0",
        status: "published"
      }
    });
    saveEvent(piEvent);
    console.log(`3. 管道发布设计: ${piEvent.event_id}`);
    
    // 3. 仪控确认并发布仪控设计
    const inResult = await SUBSCRIBER_HANDLERS["IN"](piEvent);
    if (inResult.success) {
      piEvent.acknowledged_by.push("IN");
      console.log(`4. 仪控确认: ${inResult.note}`);
      
      const inEvent = createTestEvent({
        event_type: "discipline_output.published",
        producer: "IN",
        payload: {
          object_id: "IN-OUTPUT-001",
          object_type: "DisciplineOutput",
          discipline: "IN",
          output_type: "InstrumentationDiagram",
          version: "1.0",
          status: "published"
        }
      });
      saveEvent(inEvent);
      console.log(`5. 仪控发布设计: ${inEvent.event_id}`);
      
      // 4. 电气确认
      const elResult = await SUBSCRIBER_HANDLERS["EL"](inEvent);
      if (elResult.success) {
        inEvent.acknowledged_by.push("EL");
        console.log(`6. 电气确认: ${elResult.note}`);
      }
    }
  }
  
  // 5. 检查所有事件状态
  console.log("\n--- 提资链完成状态 ---");
  const allEvents = [prEvent];
  for (const event of allEvents) {
    const allAcked = event.subscribers.every(s => event.acknowledged_by.includes(s));
    console.log(`事件 ${event.event_id}: ${allAcked ? "✅ 全部确认" : "⚠️ 部分未确认"}`);
  }
}

// 主测试函数
async function runTests() {
  console.log("🚀 VDI 事件总线集成测试开始");
  console.log(`测试项目: ${TEST_PROJECT_ID}`);
  console.log(`工作空间: ${TEST_WORKSPACE}`);
  
  try {
    // 清理测试环境
    const eventsDir = path.join(TEST_WORKSPACE, ".pilotdeck", "projects", TEST_PROJECT_ID, "events");
    if (fs.existsSync(eventsDir)) {
      fs.rmSync(eventsDir, { recursive: true, force: true });
      console.log("🧹 已清理测试环境");
    }
    
    // 运行测试
    await testEventPublishAndConsume();
    await testMultiEventWorkflow();
    await testEventStatusMonitoring();
    await testCrossDisciplineHandoff();
    
    console.log("\n✅ 所有测试完成");
    
  } catch (error) {
    console.error("❌ 测试失败:", error);
    process.exit(1);
  }
}

// 运行测试
runTests();