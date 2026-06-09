export function snapToGrid(value, gridSize) {
  return Math.round(value / gridSize) * gridSize;
}

export function snapPointToGrid(x, y, gridSize) {
  return { x: snapToGrid(x, gridSize), y: snapToGrid(y, gridSize) };
}

export function distance(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function projectPointOntoLine(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: x1, y: y1, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return { x: x1 + t * dx, y: y1 + t * dy, t };
}

export function distanceToSegment(px, py, x1, y1, x2, y2) {
  const proj = projectPointOntoLine(px, py, x1, y1, x2, y2);
  return distance(px, py, proj.x, proj.y);
}

export function pipeAngle(pipe) {
  return Math.atan2(pipe.y2 - pipe.y1, pipe.x2 - pipe.x1);
}

export function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
