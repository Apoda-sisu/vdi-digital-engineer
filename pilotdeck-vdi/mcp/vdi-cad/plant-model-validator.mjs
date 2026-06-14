/**
 * PlantModel publish gate — completeness checks for design release.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * @param {object} model PlantModel v1
 * @param {{ stage?: string, min_equipment?: number }} options
 */
export function validatePlantModelForPublish(model, options = {}) {
  const stage = options.stage || "checking";
  const minEquipment = options.min_equipment ?? 1;
  const issues = [];

  if (!model || typeof model !== "object") {
    return { valid: false, publishable: false, issues: [{ field: "model", error: "model must be an object", severity: "error" }] };
  }

  if (!model.project_id) {
    issues.push({ field: "project_id", error: "project_id is required", severity: "error" });
  }

  const objects = model.objects || [];
  if (!Array.isArray(objects) || objects.length === 0) {
    issues.push({ field: "objects", error: "objects must be a non-empty array", severity: "error" });
  }

  const byClass = {};
  const seenIds = new Set();
  for (const obj of objects) {
    const cls = obj.class || "Unknown";
    byClass[cls] = (byClass[cls] || 0) + 1;

    const oid = obj.object_id || "";
    if (!UUID_RE.test(oid)) {
      issues.push({ field: "object_id", error: `invalid object_id: ${oid}`, severity: "error", tag: obj.tag });
    } else if (seenIds.has(oid)) {
      issues.push({ field: "object_id", error: `duplicate object_id: ${oid}`, severity: "error", tag: obj.tag });
    } else {
      seenIds.add(oid);
    }

    if (!obj.tag) {
      issues.push({ field: "tag", error: "tag is required", severity: "error", object_id: oid });
    }
  }

  const equipment = objects.filter((o) => o.class === "Equipment");
  if (equipment.length < minEquipment) {
    issues.push({
      field: "Equipment.count",
      error: `expected >= ${minEquipment} Equipment, got ${equipment.length}`,
      severity: "error",
    });
  }

  for (const eq of equipment) {
    const attrs = eq.attributes || {};
    if (attrs.design_P_MPaG == null || attrs.design_P_MPaG === "") {
      issues.push({
        field: `Equipment.${eq.tag}.design_P_MPaG`,
        error: "缺少设计压力 design_P_MPaG",
        severity: stage === "approval" ? "error" : "error",
        tag: eq.tag,
        class: "Equipment",
      });
    }
    if (attrs.design_T_C == null || attrs.design_T_C === "") {
      issues.push({
        field: `Equipment.${eq.tag}.design_T_C`,
        error: "缺少设计温度 design_T_C",
        severity: "warning",
        tag: eq.tag,
        class: "Equipment",
      });
    }
  }

  const pipes = objects.filter((o) => o.class === "PipeRun");
  for (const pipe of pipes) {
    const dn = pipe.attributes?.dn;
    if (dn == null || dn === "") {
      issues.push({
        field: `PipeRun.${pipe.tag}.dn`,
        error: "缺少管径 dn",
        severity: "error",
        tag: pipe.tag,
        class: "PipeRun",
      });
    }
  }

  const views = model.views || [];
  if (!views.length) {
    issues.push({ field: "views", error: "至少需要一个 ViewDefinition", severity: "warning" });
  }

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return {
    valid: errors.length === 0,
    publishable: errors.length === 0,
    stage,
    object_count: objects.length,
    counts_by_class: byClass,
    error_count: errors.length,
    warning_count: warnings.length,
    issues,
    summary: errors.length
      ? `PlantModel 校验未通过：${errors.length} 项错误`
      : `PlantModel 校验通过（${objects.length} 对象，${warnings.length} 警告）`,
  };
}

/** Stable attribute snapshot for golden diff. */
export function plantModelAttributeSnapshot(model) {
  const snap = {};
  for (const obj of model.objects || []) {
    snap[obj.tag] = {
      class: obj.class,
      object_id: obj.object_id,
      attributes: { ...(obj.attributes || {}) },
    };
  }
  return snap;
}

export function diffPlantModelSnapshots(baseline, current) {
  const diffs = [];
  const allTags = new Set([...Object.keys(baseline), ...Object.keys(current)]);

  for (const tag of [...allTags].sort()) {
    const a = baseline[tag];
    const b = current[tag];
    if (!a) {
      diffs.push({ tag, kind: "added", current: b });
      continue;
    }
    if (!b) {
      diffs.push({ tag, kind: "removed", baseline: a });
      continue;
    }
    if (a.class !== b.class) {
      diffs.push({ tag, kind: "class_changed", baseline: a.class, current: b.class });
    }
    const attrKeys = new Set([
      ...Object.keys(a.attributes || {}),
      ...Object.keys(b.attributes || {}),
    ]);
    for (const key of [...attrKeys].sort()) {
      const av = a.attributes?.[key];
      const bv = b.attributes?.[key];
      if (JSON.stringify(av) !== JSON.stringify(bv)) {
        diffs.push({ tag, kind: "attribute", field: key, baseline: av, current: bv });
      }
    }
  }
  return diffs;
}

export function countByClass(model) {
  const counts = {};
  for (const obj of model.objects || []) {
    counts[obj.class] = (counts[obj.class] || 0) + 1;
  }
  return counts;
}
