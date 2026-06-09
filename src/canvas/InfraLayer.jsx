/**
 * InfraLayer — renders infrastructure items (power distros, DMX nodes,
 * network switches, network ports) inside the Canvas SVG world group.
 */
import React from 'react';

const SZ = 22; // half-size of infra symbol box (world units)

// ── Symbols ────────────────────────────────────────────────────────────────

function DistroSymbol({ x, y, sz, selected, item }) {
  const w = sz * 2.4, h = sz * 1.6;
  return (
    <g transform={`translate(${x - w/2}, ${y - h/2})`}>
      <rect width={w} height={h} rx={3} fill="#1a1a2e" stroke={selected ? '#facc15' : '#d97706'} strokeWidth={selected ? 2 : 1.5} />
      {/* breaker symbols */}
      <text x={w/2} y={h * 0.48} textAnchor="middle" fontSize={h * 0.38} fill="#facc15" fontWeight="bold">PDU</text>
      <text x={w/2} y={h * 0.82} textAnchor="middle" fontSize={h * 0.22} fill="#d97706">{item.label || 'Distro'}</text>
      {/* breaker dots */}
      {(item.circuits || []).slice(0, 6).map((c, i) => (
        <circle key={c.id} cx={6 + i * (w - 8) / Math.max(5, (item.circuits?.length ?? 1) - 1)} cy={h * 0.15} r={3}
          fill={c.label ? '#facc15' : '#374151'} opacity={0.9} />
      ))}
    </g>
  );
}

function NodeSymbol({ x, y, sz, selected, item }) {
  const r = sz * 0.9;
  return (
    <g>
      <rect x={x - r} y={y - r * 0.7} width={r * 2} height={r * 1.4} rx={4}
        fill="#1a1a2e" stroke={selected ? '#a78bfa' : '#7c3aed'} strokeWidth={selected ? 2 : 1.5} />
      <text x={x} y={y + r * 0.15} textAnchor="middle" fontSize={r * 0.65} fill="#a78bfa" fontWeight="bold">NODE</text>
      <text x={x} y={y + r * 0.65} textAnchor="middle" fontSize={r * 0.38} fill="#7c3aed">{item.label || 'Node'}</text>
    </g>
  );
}

function SwitchSymbol({ x, y, sz, selected, item }) {
  const w = sz * 2.2, h = sz * 1.2;
  return (
    <g transform={`translate(${x - w/2}, ${y - h/2})`}>
      <rect width={w} height={h} rx={3}
        fill="#1a1a2e" stroke={selected ? '#34d399' : '#059669'} strokeWidth={selected ? 2 : 1.5} />
      <text x={w/2} y={h * 0.52} textAnchor="middle" fontSize={h * 0.42} fill="#34d399" fontWeight="bold">SW</text>
      <text x={w/2} y={h * 0.88} textAnchor="middle" fontSize={h * 0.28} fill="#059669">{item.label || 'Switch'}</text>
    </g>
  );
}

function NetPortSymbol({ x, y, sz, selected, item }) {
  const r = sz * 0.65;
  return (
    <g>
      <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={2}
        fill="#1a1a2e" stroke={selected ? '#6ee7b7' : '#10b981'} strokeWidth={selected ? 2 : 1.5} />
      <text x={x} y={y + r * 0.3} textAnchor="middle" fontSize={r * 0.9} fill="#10b981">🔌</text>
      {item.label && (
        <text x={x} y={y + r * 1.5} textAnchor="middle" fontSize={r * 0.7} fill="#10b981">{item.label}</text>
      )}
    </g>
  );
}

const INFRA_RENDERERS = {
  distro:  DistroSymbol,
  node:    NodeSymbol,
  switch:  SwitchSymbol,
  netport: NetPortSymbol,
};

// ── Export ─────────────────────────────────────────────────────────────────

export default function InfraLayer({
  infrastructure = [],
  selectedId,
  zoom,
  onMouseDown,
}) {
  return (
    <g>
      {infrastructure.map(item => {
        const Sym = INFRA_RENDERERS[item.type];
        if (!Sym) return null;
        const selected = item.id === selectedId;
        return (
          <g key={item.id}
            style={{ cursor: 'pointer' }}
            onMouseDown={e => onMouseDown && onMouseDown(e, item)}>
            {/* On-structure indicator */}
            {item.onStructureId && (
              <circle cx={item.x} cy={item.y} r={SZ * 0.35}
                fill="none" stroke="#e0c060" strokeWidth={1.5 / zoom}
                strokeDasharray={`${3/zoom} ${2/zoom}`} />
            )}
            <Sym x={item.x} y={item.y} sz={SZ / zoom * zoom} selected={selected} item={item} />
          </g>
        );
      })}
    </g>
  );
}

export { SZ as INFRA_SZ };
