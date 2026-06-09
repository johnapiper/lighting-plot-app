/**
 * Cable ratings, connector specs, and power calculation utilities.
 */

export const CABLE_TYPES = {
  // ── Power ────────────────────────────────────────────────────────────────
  powercon: {
    label: 'Powercon (20A)',
    category: 'power',
    maxAmps: 20,
    connector: 'Powercon Blue NAC3FCA',
    color: '#3b82f6',
    maxWatts: 4600,   // 20A × 230V
  },
  truecon: {
    label: 'Powercon True1 (20A)',
    category: 'power',
    maxAmps: 20,
    connector: 'Powercon True1 TOP',
    color: '#2563eb',
    maxWatts: 4600,
  },
  '13A': {
    label: '13A BS1363',
    category: 'power',
    maxAmps: 13,
    connector: '13A BS Plug',
    color: '#7c3aed',
    maxWatts: 2990,
  },
  '16A': {
    label: '16A IEC 60309',
    category: 'power',
    maxAmps: 16,
    connector: '16A Blue CEE',
    color: '#0891b2',
    maxWatts: 3680,
  },
  '32A-1ph': {
    label: '32A Single Phase',
    category: 'power',
    maxAmps: 32,
    connector: '32A Blue CEE',
    color: '#0284c7',
    maxWatts: 7360,
  },
  '32A-3ph': {
    label: '32A Three Phase',
    category: 'power',
    maxAmps: 32,        // per phase
    totalAmps: 96,      // 3 × 32A
    phases: 3,
    connector: '32A Red CEE 5-pin',
    color: '#dc2626',
    maxWatts: 22080,    // 32A × 230V × 3ph
  },
  socapex: {
    label: 'Socapex 19-pin',
    category: 'power',
    maxAmps: 16,        // per circuit, 6 circuits
    circuits: 6,
    connector: 'Socapex 19-pin',
    color: '#be185d',
    maxWatts: 3680,     // per circuit
  },

  // ── DMX ──────────────────────────────────────────────────────────────────
  dmx5: {
    label: 'DMX 5-pin XLR',
    category: 'dmx',
    color: '#f59e0b',
    connector: 'XLR 5-pin',
  },
  dmx3: {
    label: 'DMX 3-pin XLR',
    category: 'dmx',
    color: '#d97706',
    connector: 'XLR 3-pin',
  },

  // ── Network ───────────────────────────────────────────────────────────────
  ethercon: {
    label: 'EtherCon (Cat5e)',
    category: 'network',
    color: '#10b981',
    connector: 'EtherCon RJ45',
  },
  cat5e: {
    label: 'Cat5e Patch',
    category: 'network',
    color: '#059669',
    connector: 'RJ45',
  },
  cat6: {
    label: 'Cat6 Patch',
    category: 'network',
    color: '#047857',
    connector: 'RJ45',
  },
};

export const POWER_CABLE_TYPES  = Object.entries(CABLE_TYPES).filter(([,v]) => v.category === 'power').map(([k]) => k);
export const DMX_CABLE_TYPES    = Object.entries(CABLE_TYPES).filter(([,v]) => v.category === 'dmx').map(([k]) => k);
export const NETWORK_CABLE_TYPES = Object.entries(CABLE_TYPES).filter(([,v]) => v.category === 'network').map(([k]) => k);

export const CIRCUIT_RATINGS = ['13A', '16A', '32A-1ph', '32A-3ph'];

/** Watts → Amps at 230V single-phase */
export function wattsToAmps(watts, voltage = 230) {
  return watts / voltage;
}

/** Amps → Watts at 230V */
export function ampsToWatts(amps, voltage = 230) {
  return amps * voltage;
}

/**
 * Calculate total load on a circuit.
 * @param {Array} items - fixtures/infra with { wattage } property
 * @param {string} cableType - key of CABLE_TYPES
 */
export function calcCircuitLoad(items, cableType) {
  const spec = CABLE_TYPES[cableType];
  const totalWatts = items.reduce((s, f) => s + (Number(f.wattage) || 0), 0);
  const totalAmps  = wattsToAmps(totalWatts);
  const maxAmps    = spec?.maxAmps ?? 16;
  const maxWatts   = spec?.maxWatts ?? ampsToWatts(maxAmps);
  return {
    totalWatts,
    totalAmps: Math.round(totalAmps * 10) / 10,
    maxAmps,
    maxWatts,
    overloaded: totalAmps > maxAmps,
    utilizationPct: Math.round((totalAmps / maxAmps) * 100),
  };
}

/**
 * Walk a DMX chain starting from a node output and return
 * { fixtures: [...], universe, dmxChannelMap: {fixtureId: channel} }
 */
export function traceDmxChain(startNodeId, outputIndex, cables, fixtureMap, infraMap) {
  const chain = [];
  let cursor = { id: startNodeId, type: 'infra' };
  const visited = new Set();

  while (cursor) {
    const key = `${cursor.type}-${cursor.id}`;
    if (visited.has(key)) break;
    visited.add(key);

    // Find DMX cable going OUT from cursor
    const outCable = cables.find(c =>
      c.cableType === 'dmx' &&
      c.fromId === cursor.id && c.fromType === cursor.type
    );
    if (!outCable) break;

    const nextId   = outCable.toId;
    const nextType = outCable.toType;
    if (nextType === 'fixture') chain.push(nextId);
    cursor = { id: nextId, type: nextType };
  }

  return chain;
}
