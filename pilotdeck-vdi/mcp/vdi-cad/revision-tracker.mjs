/**
 * PlantModel revision traceability: change_log + view title_block sync.
 */

const REVISION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function nextRevision(current) {
  const rev = String(current || "A").trim().toUpperCase();
  if (!rev) return "A";
  const last = rev.slice(-1);
  const prefix = rev.slice(0, -1);
  const idx = REVISION_LETTERS.indexOf(last);
  if (idx >= 0 && idx < REVISION_LETTERS.length - 1) {
    return prefix + REVISION_LETTERS[idx + 1];
  }
  return `${rev}1`;
}

export function appendChangeLog(model, entry) {
  const log = [...(model.change_log || [])];
  log.push({
    timestamp: entry.timestamp || new Date().toISOString(),
    revision: entry.revision || model.revision,
    author: entry.author || "system",
    action: entry.action || "update",
    object_ids: entry.object_ids || [],
    summary: entry.summary || "",
  });
  return { ...model, change_log: log };
}

/**
 * Apply attribute/object delta and optionally bump revision.
 * @param {object} model
 * @param {{ objects?: object[], bump_revision?: boolean, author?: string, summary?: string }} delta
 */
export function applyPlantDelta(model, delta) {
  const byId = new Map((model.objects || []).map((o) => [o.object_id, { ...o }]));
  const changedIds = [];

  for (const patch of delta.objects || []) {
    const oid = patch.object_id;
    if (!oid) continue;
    changedIds.push(oid);
    if (byId.has(oid)) {
      const existing = byId.get(oid);
      byId.set(oid, {
        ...existing,
        ...patch,
        attributes: {
          ...(existing.attributes || {}),
          ...(patch.attributes || {}),
        },
        relationships: patch.relationships ?? existing.relationships,
      });
    } else {
      byId.set(oid, { ...patch });
    }
  }

  let result = {
    ...model,
    objects: [...byId.values()],
  };

  if (changedIds.length) {
    const bump = delta.bump_revision !== false;
    const newRev = bump ? nextRevision(model.revision) : model.revision;
    result.revision = newRev;
    result = appendChangeLog(result, {
      revision: newRev,
      author: delta.author,
      action: "delta_apply",
      object_ids: changedIds,
      summary: delta.summary || `Updated ${changedIds.length} object(s)`,
    });
    if (bump) {
      result = syncViewRevisions(result);
    }
  }

  return result;
}

/** Align all view title_block.revision with model.revision. */
export function syncViewRevisions(model) {
  const revision = model.revision || "A";
  const views = (model.views || []).map((v) => ({
    ...v,
    title_block: {
      ...(v.title_block || {}),
      revision,
    },
  }));
  return { ...model, views };
}

export function validateRevisionConsistency(model) {
  const issues = [];
  const modelRev = model.revision || "A";
  for (const view of model.views || []) {
    const tbRev = view.title_block?.revision;
    if (tbRev && tbRev !== modelRev) {
      issues.push({
        severity: "warning",
        code: "REVISION_MISMATCH",
        message: `View ${view.view_id} title_block.revision=${tbRev} != model.revision=${modelRev}`,
      });
    }
  }
  if (!model.change_log?.length) {
    issues.push({
      severity: "info",
      code: "NO_CHANGE_LOG",
      message: "PlantModel has no change_log entries",
    });
  }
  return { ok: issues.every((i) => i.severity !== "error"), issues };
}
