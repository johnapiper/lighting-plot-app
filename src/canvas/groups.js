// ── Group helpers ─────────────────────────────────────────────────────────
export function getAllObjectsFromDrawing(d) {
  return [...(d.fixtures||[]), ...(d.pipes||[]), ...(d.lines||[]),
          ...(d.rectangles||[]), ...(d.texts||[]), ...(d.images||[])];
}
export function setGroupIdInDrawing(d, ids, groupId) {
  const idSet = new Set(ids);
  ['fixtures','pipes','lines','rectangles','texts','images'].forEach(arr => {
    (d[arr]||[]).forEach(obj => { if (idSet.has(obj.id)) { if (groupId) obj.groupId = groupId; else delete obj.groupId; } });
  });
}

