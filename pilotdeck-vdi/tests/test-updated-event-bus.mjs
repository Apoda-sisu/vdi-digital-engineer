#!/usr/bin/env node
/**
 * 更新后的事件总线集成测试
 * =======================
 * 测试新的事件类型和订阅关系
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

// 获取订阅者（基于新的事件注册表）
function getSubscribers(eventType, producer) {
  const subscriberMap = {
    "design_basis.updated": {
      "PR": ["PI", "IN", "EQ", "WA", "HS", "MA", "EL"],
      "SY": ["PR", "PI", "EQ", "MP"]
    },
    "design_basis.acknowledged": {
      "PI": ["PR"],
      "IN": ["PR"],
      "EQ": ["PR"],
      "WA": ["PR"],
      "HS": ["PR"],
      "MA": ["PR"],
      "EL": ["PR"]
    },
    "discipline_output.published": {
      "PR": ["PI", "IN", "EQ", "WA", "HS", "MA"],
      "SY": ["PR", "PI", "EQ", "MP"],
      "PI": ["IN", "ST", "WA", "MA", "EL"],
      "IN": ["EL", "PI", "ST", "AR"],
      "EQ": ["ST", "PI", "IN"],
      "WA": ["FI", "EL", "PI", "MA"],
      "EL": ["IN", "PI", "AR", "ST"],
      "HS": ["PR", "WA"],
      "MA": ["PI", "IN"],
      "ST": ["AR", "PI"],
      "AR": ["ST", "PI", "WA"]
    },
    "condition.changed": {
      "SI": ["PI", "WA", "EL", "AR"],
      "AR": ["WA", "EL", "HV", "PI", "ST"],
      "EL": ["IN", "EQ", "WA", "HV", "PI"],
      "ST": ["PI", "WA", "EL", "AR"],
      "WA": ["PI", "IN", "EL"]
    },
    "piping_layout.updated": {
      "PI": ["IN", "EL", "ST", "WA", "MA"]
    },
    "instrument_location.updated": {
      "IN": ["PI", "EL", "ST"]
    },
    "electrical_layout.updated": {
      "EL": ["PI", "IN", "ST", "AR"]
    },
    "structural_condition.updated": {
      "ST": ["PI", "IN", "EQ", "WA"]
    },
    "equipment_data.updated": {
      "EQ": ["PI", "IN", "WA", "ST"]
    },
    "water_condition.updated": {
      "WA": ["FI", "EL", "PI", "IN"]
    },
    "fire_condition.updated": {
      "FI": ["WA", "EL", "PI"]
    },
    "hvac_condition.updated": {
      "HV": ["WA", "EL", "PI"]
    },
    "material_data.updated": {
      "MA": ["PI", "IN"]
    },
    "stress_analysis.completed": {
      "ST": ["PI"]
    },
    "procurement.requested": {
      "IN": ["PROC"],
      "EQ": ["PROC"]
    },
    "procurement.acknowledged": {
      "PROC": ["IN", "EQ"]
    },
    "model_review.scheduled": {
      "PI": ["IN", "EL", "ST", "EQ", "WA"]
    },
    "model_review.completed": {
      "PI": ["MG", "QA"]
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
    schema_version: "2.0.0",
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
    "design_basis.acknowledged": async (event) => {
      console.log(`[PR] 收到下游专业确认: ${event.producer}`);
      return { success: true, note: "工艺专业已记录确认" };
    },
    "review_gate.failed": async (event) => {
      console.log(`[PR] 收到校审失败通知`);
      return { success: true, note: "工艺专业将进行整改" };
    }
  },
  
  // 管道专业处理器
  "PI": {
    "design_basis.updated": async (event) => {
      console.log(`[PI] 处理设计基础更新: ${event.payload.basis_items?.length || 0} 项参数`);
      return { success: true, note: "管道专业已确认设计基础" };
    },
    "discipline_output.published": async (event) => {
      console.log(`[PI] 处理专业输出发布: ${event.payload.output_type}`);
      return { success: true, note: "管道专业已确认输出" };
    },
    "piping_layout.updated": async (event) => {
      console.log(`[PI] 处理管道布置更新: ${event.payload.drawing_number}`);
      return { success: true, note: "管道专业已确认布置更新" };
    },
    "instrument_location.updated": async (event) => {
      console.log(`[PI] 处理仪表位置更新`);
      return { success: true, note: "管道专业已确认仪表位置" };
    },
    "electrical_layout.updated": async (event) => {
      console.log(`[PI] 处理电气布置更新`);
      return { success: true, note: "管道专业已确认电气布置" };
    },
    "structural_condition.updated": async (event) => {
      console.log(`[PI] 处理结构条件更新`);
      return { success: true, note: "管道专业已确认结构条件" };
    },
    "equipment_data.updated": async (event) => {
      console.log(`[PI] 处理设备数据更新`);
      return { success: true, note: "管道专业已确认设备数据" };
    },
    "material_data.updated": async (event) => {
      console.log(`[PI] 处理材料数据更新`);
      return { success: true, note: "管道专业已确认材料数据" };
    },
    "condition.changed": async (event) => {
      console.log(`[PI] 处理条件变更: ${event.payload.change_type}`);
      return { success: true, note: "管道专业已确认条件变更" };
    }
  },
  
  // 仪控专业处理器
  "IN": {
    "design_basis.updated": async (event) => {
      console.log(`[IN] 处理设计基础更新: ${event.payload.basis_items?.length || 0} 项参数`);
      return { success: true, note: "仪控专业已确认设计基础" };
    },
    "discipline_output.published": async (event) => {
      console.log(`[IN] 处理专业输出发布: ${event.payload.output_type}`);
      return { success: true, note: "仪控专业已确认输出" };
    },
    "piping_layout.updated": async (event) => {
      console.log(`[IN] 处理管道布置更新`);
      return { success: true, note: "仪控专业已确认管道布置" };
    },
    "electrical_layout.updated": async (event) => {
      console.log(`[IN] 处理电气布置更新`);
      return { success: true, note: "仪控专业已确认电气布置" };
    },
    "material_data.updated": async (event) => {
      console.log(`[IN] 处理材料数据更新`);
      return { success: true, note: "仪控专业已确认材料数据" };
    },
    "condition.changed": async (event) => {
      console.log(`[IN] 处理条件变更: ${event.payload.change_type}`);
      return { success: true, note: "仪控专业已确认条件变更" };
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
    "piping_layout.updated": async (event) => {
      console.log(`[EL] 处理管道布置更新`);
      return { success: true, note: "电气专业已确认管道布置" };
    },
    "instrument_location.updated": async (event) => {
      console.log(`[EL] 处理仪表位置更新`);
      return { success: true, note: "电气专业已确认仪表位置" };
    },
    "water_condition.updated": async (event) => {
      console.log(`[EL] 处理给排水条件更新`);
      return { success: true, note: "电气专业已确认给排水条件" };
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
    "piping_layout.updated": async (event) => {
      console.log(`[WA] 处理管道布置更新`);
      return { success: true, note: "给排水专业已确认管道布置" };
    },
    "equipment_data.updated": async (event) => {
      console.log(`[WA] 处理设备数据更新`);
      return { success: true, note: "给排水专业已确认设备数据" };
    },
    "structural_condition.updated": async (event) => {
      console.log(`[WA] 处理结构条件更新`);
      return { success: true, note: "给排水专业已确认结构条件" };
    },
    "condition.changed": async (event) => {
      console.log(`[WA] 处理条件变更: ${event.payload.change_type}`);
      return { success: true, note: "给排水专业已确认条件变更" };
    }
  },
  
  // 结构专业处理器
  "ST": {
    "discipline_output.published": async (event) => {
      console.log(`[ST] 处理专业输出发布: ${event.payload.output_type}`);
      return { success: true, note: "结构专业已确认输出" };
    },
    "piping_layout.updated": async (event) => {
      console.log(`[ST] 处理管道布置更新`);
      return { success: true, note: "结构专业已确认管道布置" };
    },
    "instrument_location.updated": async (event) => {
      console.log(`[ST] 处理仪表位置更新`);
      return { success: true, note: "结构专业已确认仪表位置" };
    },
    "electrical_layout.updated": async (event) => {
      console.log(`[ST] 处理电气布置更新`);
      return { success: true, note: "结构专业已确认电气布置" };
    },
    "equipment_data.updated": async (event) => {
      console.log(`[ST] 处理设备数据更新`);
      return { success: true, note: "结构专业已确认设备数据" };
    },
    "condition.changed": async (event) => {
      console.log(`[ST] 处理条件变更: ${event.payload.change_type}`);
      return { success: true, note: "结构专业已确认条件变更" };
    }
  },
  
  // 建筑专业处理器
  "AR": {
    "discipline_output.published": async (event) => {
      console.log(`[AR] 处理专业输出发布: ${event.payload.output_type}`);
      return { success: true, note: "建筑专业已确认输出" };
    },
    "electrical_layout.updated": async (event) => {
      console.log(`[AR] 处理电气布置更新`);
      return { success: true, note: "建筑专业已确认电气布置" };
    },
    "condition.changed": async (event) => {
      console.log(`[AR] 处理条件变更: ${event.payload.change_type}`);
      return { success: true, note: "建筑专业已确认条件变更" };
    }
  },
  
  // 材料专业处理器
  "MA": {
    "discipline_output.published": async (event) => {
      console.log(`[MA] 处理专业输出发布: ${event.payload.output_type}`);
      return { success: true, note: "材料专业已确认输出" };
    },
    "piping_layout.updated": async (event) => {
      console.log(`[MA] 处理管道布置更新`);
      return { success: true, note: "材料专业已确认管道布置" };
    }
  },
  
  // 采购部门处理器
  "PROC": {
    "procurement.requested": async (event) => {
      console.log(`[PROC] 处理采购请求: ${event.payload.item_type}`);
      return { success: true, note: "采购部门已确认收到采购请求" };
    }
  },
  
  // 管理部门处理器
  "MG": {
    "model_review.completed": async (event) => {
      console.log(`[MG] 处理模型审查完成`);
      return { success: true, note: "管理部门已确认模型审查完成" };
    }
  },
  
  // 质量部门处理器
  "QA": {
    "discipline_output.submitted": async (event) => {
      console.log(`[QA] 处理专业输出提交`);
      return { success: true, note: "质量部门已确认收到输出" };
    },
    "model_review.completed": async (event) => {
      console.log(`[QA] 处理模型审查完成`);
      return { success: true, note: "质量部门已确认模型审查完成" };
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

// 测试新的事件类型
async function testNewEventTypes() {
  console.log("\n=== 测试 1: 新的事件类型 ===");
  
  // 1. 测试管道布置更新
  const pipingEvent = createEvent("piping_layout.updated", "PI", {
    project_id: TEST_PROJECT_ID,
    drawing_number: "PL-001",
    revision: "B",
    changes: [
      { line_number: "1001", parameter: "elevation", old_value: "EL.100.000", new_value: "EL.100.500" }
    ]
  });
  saveEvent(pipingEvent);
  console.log(`1. 管道专业发布管道布置更新: ${pipingEvent.event_id}`);
  
  // 2. 测试仪表位置更新
  const instrumentEvent = createEvent("instrument_location.updated", "IN", {
    project_id: TEST_PROJECT_ID,
    instrument_tag: "FT-1001",
    location: "Pipe Rack A",
    installation_type: "inline"
  });
  saveEvent(instrumentEvent);
  console.log(`2. 仪控专业发布仪表位置更新: ${instrumentEvent.event_id}`);
  
  // 3. 测试电气布置更新
  const electricalEvent = createEvent("electrical_layout.updated", "EL", {
    project_id: TEST_PROJECT_ID,
    cable_tray_id: "CT-001",
    route: "From Substation to Unit 1",
    elevation: "EL.105.000"
  });
  saveEvent(electricalEvent);
  console.log(`3. 电气专业发布电气布置更新: ${electricalEvent.event_id}`);
  
  // 4. 测试结构条件更新
  const structuralEvent = createEvent("structural_condition.updated", "ST", {
    project_id: TEST_PROJECT_ID,
    structure_id: "ST-001",
    foundation_type: "pile",
    load_capacity: "500 tons"
  });
  saveEvent(structuralEvent);
  console.log(`4. 结构专业发布结构条件更新: ${structuralEvent.event_id}`);
  
  // 5. 测试设备数据更新
  const equipmentEvent = createEvent("equipment_data.updated", "EQ", {
    project_id: TEST_PROJECT_ID,
    equipment_tag: "V-1001",
    equipment_type: "vessel",
    design_pressure: "1.6 MPa",
    design_temperature: "250 °C"
  });
  saveEvent(equipmentEvent);
  console.log(`5. 设备专业发布设备数据更新: ${equipmentEvent.event_id}`);
  
  // 处理所有事件
  const events = [pipingEvent, instrumentEvent, electricalEvent, structuralEvent, equipmentEvent];
  for (const event of events) {
    await processEvent(event);
  }
}

// 测试跨专业协作流程
async function testCrossDisciplineCollaboration() {
  console.log("\n=== 测试 2: 跨专业协作流程 ===");
  
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
  
  // 2. 下游专业确认
  const downstreamDisciplines = ["PI", "IN", "EQ", "WA", "HS", "MA", "EL"];
  for (const discipline of downstreamDisciplines) {
    const handler = DISCIPLINE_HANDLERS[discipline]?.["design_basis.updated"];
    if (handler) {
      const result = await handler(prBasisEvent);
      if (result.success) {
        prBasisEvent.acknowledged_by.push(discipline);
        console.log(`✅ ${discipline} 已确认: ${result.note}`);
      }
    }
  }
  
  // 3. 下游专业发布确认事件
  for (const discipline of downstreamDisciplines) {
    const ackEvent = createEvent("design_basis.acknowledged", discipline, {
      original_event_id: prBasisEvent.event_id,
      discipline: discipline,
      status: "acknowledged"
    });
    saveEvent(ackEvent);
    console.log(`3. ${discipline} 发布确认事件: ${ackEvent.event_id}`);
    
    // 处理确认事件
    await processEvent(ackEvent);
  }
  
  // 4. 管道专业发布管道布置
  const piLayoutEvent = createEvent("piping_layout.updated", "PI", {
    project_id: TEST_PROJECT_ID,
    drawing_number: "PL-001",
    revision: "A",
    changes: []
  });
  saveEvent(piLayoutEvent);
  console.log(`4. 管道专业发布管道布置: ${piLayoutEvent.event_id}`);
  
  // 5. 处理管道布置事件
  await processEvent(piLayoutEvent);
}

// 测试采购流程
async function testProcurementFlow() {
  console.log("\n=== 测试 3: 采购流程 ===");
  
  // 1. 仪控专业发布采购请求
  const inProcurementEvent = createEvent("procurement.requested", "IN", {
    project_id: TEST_PROJECT_ID,
    discipline: "IN",
    item_type: "instrument",
    specifications: [
      { tag: "FT-1001", type: "flow_transmitter", range: "0-100 m³/h", accuracy: "0.5%" },
      { tag: "PT-1001", type: "pressure_transmitter", range: "0-2.5 MPa", accuracy: "0.25%" }
    ]
  });
  saveEvent(inProcurementEvent);
  console.log(`1. 仪控专业发布采购请求: ${inProcurementEvent.event_id}`);
  
  // 2. 采购部门确认
  const procAckEvent = createEvent("procurement.acknowledged", "PROC", {
    original_event_id: inProcurementEvent.event_id,
    procurement_id: "PROC-001",
    status: "acknowledged"
  });
  saveEvent(procAckEvent);
  console.log(`2. 采购部门确认: ${procAckEvent.event_id}`);
  
  // 3. 处理事件
  await processEvent(inProcurementEvent);
  await processEvent(procAckEvent);
}

// 测试模型审查流程
async function testModelReviewFlow() {
  console.log("\n=== 测试 4: 模型审查流程 ===");
  
  // 1. 管道专业安排模型审查
  const reviewScheduledEvent = createEvent("model_review.scheduled", "PI", {
    project_id: TEST_PROJECT_ID,
    review_type: "30%",
    scheduled_date: "2026-06-15",
    participants: ["IN", "EL", "ST", "EQ", "WA"]
  });
  saveEvent(reviewScheduledEvent);
  console.log(`1. 管道专业安排模型审查: ${reviewScheduledEvent.event_id}`);
  
  // 2. 处理审查安排事件
  await processEvent(reviewScheduledEvent);
  
  // 3. 管道专业发布审查完成
  const reviewCompletedEvent = createEvent("model_review.completed", "PI", {
    project_id: TEST_PROJECT_ID,
    review_type: "30%",
    completed_date: "2026-06-15",
    result: "passed",
    issues: []
  });
  saveEvent(reviewCompletedEvent);
  console.log(`2. 管道专业发布审查完成: ${reviewCompletedEvent.event_id}`);
  
  // 4. 处理审查完成事件
  await processEvent(reviewCompletedEvent);
}

// 测试事件状态监控
async function testEventStatusMonitoring() {
  console.log("\n=== 测试 5: 事件状态监控 ===");
  
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
      for (const file of inboxFiles.slice(0, 5)) {
        const event = JSON.parse(fs.readFileSync(path.join(inboxDir, file), "utf8"));
        console.log(`  - ${event.event_id}: ${event.event_type} from ${event.producer}`);
      }
    }
  }
  
  if (fs.existsSync(processedDir)) {
    const processedFiles = fs.readdirSync(processedDir).filter(f => f.endsWith(".json"));
    if (processedFiles.length > 0) {
      console.log(`\n最近已处理事件:`);
      for (const file of processedFiles.slice(-5)) {
        const event = JSON.parse(fs.readFileSync(path.join(processedDir, file), "utf8"));
        console.log(`  - ${event.event_id}: ${event.event_type} from ${event.producer}`);
      }
    }
  }
  
  return { inboxCount, processedCount };
}

// 主测试函数
async function runTests() {
  console.log("🚀 更新后的事件总线集成测试开始");
  console.log(`测试项目: ${TEST_PROJECT_ID}`);
  console.log(`工作空间: ${TEST_WORKSPACE}`);
  
  try {
    // 清理测试环境
    if (fs.existsSync(eventsDir)) {
      fs.rmSync(eventsDir, { recursive: true, force: true });
      console.log("🧹 已清理测试环境");
    }
    
    // 运行测试
    await testNewEventTypes();
    await testCrossDisciplineCollaboration();
    await testProcurementFlow();
    await testModelReviewFlow();
    await testEventStatusMonitoring();
    
    console.log("\n✅ 所有测试完成");
    
  } catch (error) {
    console.error("❌ 测试失败:", error);
    process.exit(1);
  }
}

// 运行测试
runTests();