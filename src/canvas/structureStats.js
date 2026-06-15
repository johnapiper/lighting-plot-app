// Structure analysis: given a selected pipe/truss, find the whole connected
// structure (pipes joined at endpoints) and sum up weights of the structure
// itself, every fixture hung on it, and the cabling that runs to it.
//
// All lengths are in millimetres (1 world unit = 1 mm). Weights in kg.

import { calcCableRoute } from '../cabling/routing';

// Rough self-weight estimates (kg per metre) when a pipe/truss carries no
// explicit weightKgPerM. Standard 48mm scaff/barrel ≈ 1.7 kg/m; box/tri truss ≈ 5 kg/m.
const PIPE_KG_PER_M = 1.7;
const TRUSS_KG_PER_M = 5.0;

// Cable copper+jacket weight (kg per metre) by type — small but real.
const CABLE_KG_PER_M = { power: 0.12, dmx: 0.04, network: 0.035 };
const DEFAULT_FIXTURE_KG = 5; // when a fixture type has no GDTF weight

const len = (p) => Math.hypot(p.x2 - p.x1, p.y2 - p.y1);

// Find all pipes joined to `startId` through shared endpoints (BFS, 2mm tol).
export function connectedPipeIds(startId, pipes) {
  const eps = 2;
  const meet = (p, q) => {
    const m = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) <= eps;
    return m(p.x1, p.y1, q.x1, q.y1) || m(p.x1, p.y1, q.x2, q.y2) ||
           m(p.x2, p.y2, q.x1, q.y1) || m(p.x2, p.y2, q.x2, q.y2);
  };
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const p = pipes.find(pp => pp.id === queue.shift());
    if (!p) continue;
    for (const q of pipes) if (!seen.has(q.id) && meet(p, q)) { seen.add(q.id); queue.push(q.id); }
  }
  return seen;
}

export function computeStructureStats(pipe, drawing, fixtureTypes, rigHeight = 5500) {
  if (!pipe || !drawing) return null;
  const pipes = drawing.pipes || [];
  const fixtures = drawing.fixtures || [];
  const cables = drawing.cables || [];
  const infra = drawing.infrastructure || [];

  const ids = connectedPipeIds(pipe.id, pipes);
  const members = pipes.filter(p => ids.has(p.id));

  // Structure self-weight
  let structureKg = 0;
  let totalLenMm = 0;
  members.forEach(p => {
    const l = len(p);
    totalLenMm += l;
    const perM = p.weightKgPerM != null ? p.weightKgPerM
      : (p.type === 'truss' ? TRUSS_KG_PER_M : PIPE_KG_PER_M);
    structureKg += (l / 1000) * perM;
  });

  // Fixtures hung on the structure
  const onStructure = fixtures.filter(f => ids.has(f.pipeId) || ids.has(f.onStructureId));
  let fixtureKg = 0;
  const fixtureList = onStructure.map(f => {
    const ft = fixtureTypes?.find(t => t.id === f.fixtureTypeId);
    const w = ft?.weightKg != null ? ft.weightKg : DEFAULT_FIXTURE_KG;
    fixtureKg += w;
    return {
      id: f.id,
      label: f.unit || f.channel || f.type || ft?.name || 'Fixture',
      type: f.type || ft?.name || '',
      weightKg: w,
    };
  });

  // Cables running to the structure: either endpoint is on a structure fixture
  // (or the structure itself). Sum their weight by routed length.
  const onStructIds = new Set([...onStructure.map(f => f.id), ...ids]);
  const findObj = (id, t) => t === 'fixture'
    ? fixtures.find(f => f.id === id)
    : infra.find(i => i.id === id);
  let cableKg = 0;
  const cableList = [];
  cables.forEach(c => {
    const touches = onStructIds.has(c.fromId) || onStructIds.has(c.toId);
    if (!touches) return;
    const fromObj = findObj(c.fromId, c.fromType);
    const toObj = findObj(c.toId, c.toType);
    let lengthMm = 0;
    if (fromObj && toObj) {
      const from = { x: fromObj.x, y: fromObj.y, onStructureId: fromObj.onStructureId || fromObj.pipeId || null };
      const to = { x: toObj.x, y: toObj.y, onStructureId: toObj.onStructureId || toObj.pipeId || null };
      ({ lengthMm } = calcCableRoute(from, to, pipes, rigHeight));
    }
    const perM = CABLE_KG_PER_M[c.cableType] ?? 0.05;
    const w = (lengthMm / 1000) * perM;
    cableKg += w;
    cableList.push({
      id: c.id,
      type: c.cableType || 'cable',
      subtype: c.subtype || '',
      lengthMm,
      weightKg: w,
    });
  });

  return {
    memberCount: members.length,
    totalLengthMm: totalLenMm,
    structureKg,
    fixtureKg,
    cableKg,
    totalKg: structureKg + fixtureKg + cableKg,
    fixtures: fixtureList,
    cables: cableList,
  };
}
