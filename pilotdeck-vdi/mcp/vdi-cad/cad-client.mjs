/**
 * XML-RPC client for FreeCAD VDI CAD addon (localhost:9876).
 */

import xmlrpc from "node:http";

const DEFAULT_HOST = process.env.VDI_CAD_RPC_HOST || "127.0.0.1";
const DEFAULT_PORT = Number(process.env.VDI_CAD_RPC_PORT || 9876);
const TIMEOUT_MS = Number(process.env.VDI_CAD_RPC_TIMEOUT || 120000);
const EXECUTE_TIMEOUT_MS = Number(process.env.VDI_CAD_EXECUTE_TIMEOUT || 300000);

function xmlRpcCall(method, params = [], timeoutMs = TIMEOUT_MS) {
  const body = buildXmlRpcRequest(method, params);
  return new Promise((resolve, reject) => {
    const req = xmlrpc.request(
      {
        hostname: DEFAULT_HOST,
        port: DEFAULT_PORT,
        path: "/RPC2",
        method: "POST",
        headers: {
          "Content-Type": "text/xml",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(parseXmlRpcResponse(data));
          } catch (e) {
            reject(new Error(`XML-RPC parse error: ${e.message} | raw: ${data.slice(0, 300)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`RPC timeout after ${timeoutMs}ms`));
    });
    req.write(body);
    req.end();
  });
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXml(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

function buildXmlRpcRequest(method, params) {
  const paramXml = params
    .map((p) => {
      if (typeof p === "string") return `<param><value><string>${escapeXml(p)}</string></value></param>`;
      if (typeof p === "number") return `<param><value><int>${p}</int></value></param>`;
      if (typeof p === "boolean") return `<param><value><boolean>${p ? 1 : 0}</boolean></value></param>`;
      return `<param><value><string>${escapeXml(JSON.stringify(p))}</string></value></param>`;
    })
    .join("");
  return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${paramXml}</params></methodCall>`;
}

function extractTagContent(xml, tag) {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open);
  if (start === -1) return "";
  let depth = 0;
  let i = start;
  while (i < xml.length) {
    if (xml.startsWith(open, i)) {
      depth++;
      i += open.length;
      continue;
    }
    if (xml.startsWith(close, i)) {
      depth--;
      i += close.length;
      if (depth === 0) {
        return xml.slice(start + open.length, i - close.length);
      }
      continue;
    }
    i++;
  }
  return "";
}

function parseValueContent(inner) {
  const trimmed = inner.trim();
  if (trimmed.includes("<struct>")) {
    return parseStruct(extractTagContent(trimmed, "struct"));
  }
  if (trimmed.includes("<array>")) {
    return parseArray(trimmed);
  }
  if (trimmed.includes("<int>") || trimmed.includes("<i4>")) {
    const m = trimmed.match(/<(?:int|i4)>([^<]*)<\/(?:int|i4)>/);
    return m ? Number(m[1]) : 0;
  }
  if (trimmed.includes("<double>")) {
    const m = trimmed.match(/<double>([^<]*)<\/double>/);
    return m ? Number(m[1]) : 0;
  }
  if (trimmed.includes("<boolean>")) {
    const m = trimmed.match(/<boolean>(\d)<\/boolean>/);
    return m ? m[1] === "1" : false;
  }
  const s = trimmed.match(/<string>([\s\S]*?)<\/string>/);
  if (s) {
    const raw = decodeXml(s[1]);
    if (raw.startsWith("[") || raw.startsWith("{")) {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }
  return trimmed;
}

function parseStruct(structXml) {
  const result = {};
  let i = 0;
  while (i < structXml.length) {
    const memberStart = structXml.indexOf("<member>", i);
    if (memberStart === -1) break;
    const memberEnd = structXml.indexOf("</member>", memberStart);
    if (memberEnd === -1) break;
    const memberXml = structXml.slice(memberStart, memberEnd + "</member>".length);
    const nameMatch = memberXml.match(/<name>([^<]+)<\/name>/);
    if (nameMatch) {
      const valueOpen = memberXml.indexOf("<value>");
      const valueClose = memberXml.lastIndexOf("</value>");
      if (valueOpen !== -1 && valueClose > valueOpen) {
        const valueInner = memberXml.slice(valueOpen + "<value>".length, valueClose);
        result[nameMatch[1]] = parseValueContent(valueInner);
      }
    }
    i = memberEnd + "</member>".length;
  }
  return result;
}

function parseArray(valXml) {
  const data = extractTagContent(valXml, "data");
  if (!data) return [];
  const items = [];
  let i = 0;
  while (i < data.length) {
    const vStart = data.indexOf("<value>", i);
    if (vStart === -1) break;
    const vEnd = data.indexOf("</value>", vStart);
    if (vEnd === -1) break;
    const inner = data.slice(vStart + "<value>".length, vEnd);
    items.push(parseValueContent(inner));
    i = vEnd + "</value>".length;
  }
  return items;
}

function parseXmlRpcResponse(xml) {
  if (xml.includes("<fault>")) {
    const m = xml.match(/<string>([^<]*)<\/string>/);
    throw new Error(m ? decodeXml(m[1]) : "XML-RPC fault");
  }
  const paramValue = extractTagContent(xml, "param");
  if (!paramValue) {
    const strMatch = xml.match(/<string>([\s\S]*?)<\/string>/);
    if (strMatch) return decodeXml(strMatch[1]);
    return xml;
  }
  const valueInner = extractTagContent(paramValue, "value");
  return parseValueContent(valueInner || paramValue);
}

export async function ping() {
  return xmlRpcCall("ping");
}

export async function status() {
  return xmlRpcCall("status");
}

export async function execute(command) {
  const json = typeof command === "string" ? command : JSON.stringify(command);
  return xmlRpcCall("execute", [json], EXECUTE_TIMEOUT_MS);
}

export async function extractPlantModel(projectId = "", revision = "A") {
  return xmlRpcCall("extract_plant_model", [projectId, revision]);
}

export async function applyDelta(delta) {
  const json = typeof delta === "string" ? delta : JSON.stringify(delta);
  return xmlRpcCall("apply_delta", [json]);
}

export async function loadPlantModel(model, renderCommand = null) {
  const modelJson = typeof model === "string" ? model : JSON.stringify(model);
  const renderJson = renderCommand ? JSON.stringify(renderCommand) : "";
  return xmlRpcCall("load_plant_model", [modelJson, renderJson], EXECUTE_TIMEOUT_MS);
}

export async function exportDrawing(format, outputPath) {
  return xmlRpcCall("export", [format, outputPath]);
}

export async function screenshot(outputPath) {
  return xmlRpcCall("screenshot", [outputPath]);
}

export async function getObject(objectId) {
  return xmlRpcCall("get_object", [objectId]);
}

export async function resolvePick(docName, selectionJson, pickMode = "techdraw") {
  return xmlRpcCall("resolve_pick", [docName, selectionJson, pickMode]);
}

export async function diagnosePick(docName = "") {
  try {
    return xmlRpcCall("diagnose_pick", docName ? [docName] : []);
  } catch {
    return execute({ drawing_type: "__diagnose_pick__" });
  }
}

export async function checkConnection() {
  try {
    const pong = await ping();
    const st = await status();
    return { connected: pong === "pong", ping: pong, ...st };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}
