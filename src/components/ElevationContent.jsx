import React, { useMemo } from 'react';
import { buildElevation, ELEV_DIRS } from '../elevation/elevation';
import { getLayerId } from '../canvas/canvasHelpers';

/**
 * Elevation / section drawing for a sheet viewport. Everything is in WORLD units
 * (mm) so it sits in the same transform as the plan content; sizes that should
 * stay constant on the paper (line weights, text) are given in paper-mm and
 * multiplied by `renderScale` (world mm per paper mm).
 */
export default function ElevationContent({ drawing, fixtureTypes, layers, meta, vp, renderScale }) {
  const dir = vp.elevDir || 'up';
  const band = vp.elevBand && Number.isFinite(vp.elevBand.min) && Number.isFinite(vp.elevBand.max) ? vp.elevBand : null;
  const showBeams = vp.elevBeams !== false;
  const showLabels = vp.elevLabels !== false;

  const model = useMemo(() => {
    const visible = (obj, kind) => {
      if (!layers || !layers.length) return true;
      const l = layers.find(l => l.id === getLayerId(obj, kind));
      return l ? l.visible !== false : true;
    };
    return buildElevation(drawing || {}, fixtureTypes || [], meta || {}, { dir, band, visible });
  }, [drawing, fixtureTypes, layers, meta, dir, band?.min, band?.max]);

  const pm = (mm) => mm * renderScale;               // paper-mm → world units
  const ink = '#1a1a1a', soft = '#7a7a7a';
  const b = model.bounds;
  const leftEdge = b ? b.minU : 0, rightEdge = b ? b.maxU : 0;
  const pad = pm(12);
  const metres = (mm) => `${(mm / 1000).toFixed(2)} m`;

  if (!b) {
    return <text x={0} y={0} textAnchor="middle" fontSize={pm(3)} fill={soft}>Nothing to show in this view</text>;
  }

  // Distinct pipe heights → one vertical dimension each, stacked left of the rig.
  const heights = [...new Set(model.pipes.map(p => Math.round(p.heightMm)))].sort((x, y) => x - y);

  return (
    <g>
      {/* Floor + grid */}
      <line x1={leftEdge - pad * 2} y1={0} x2={rightEdge + pad} y2={0} stroke={ink} strokeWidth={pm(0.5)} />
      {Array.from({ length: Math.ceil((rightEdge - leftEdge + pad * 3) / pm(2.2)) }, (_, i) => {
        const x = leftEdge - pad * 2 + i * pm(2.2);
        return <line key={i} x1={x} y1={0} x2={x - pm(1.2)} y2={pm(1.4)} stroke={soft} strokeWidth={pm(0.15)} />;
      })}
      <text x={rightEdge + pad} y={pm(4.2)} textAnchor="end" fontSize={pm(2.2)} fill={soft}>FLOOR ±0</text>
      {model.gridMm > 0 && model.gridMm <= -b.minV + pm(20) && (
        <g>
          <line x1={leftEdge - pad * 2} y1={-model.gridMm} x2={rightEdge + pad} y2={-model.gridMm}
            stroke={soft} strokeWidth={pm(0.2)} strokeDasharray={`${pm(3)} ${pm(1.5)}`} />
          <text x={rightEdge + pad} y={-model.gridMm - pm(1)} textAnchor="end" fontSize={pm(2.2)} fill={soft}>GRID {metres(model.gridMm)}</text>
        </g>
      )}

      {/* Height dimensions */}
      {heights.map((h, i) => {
        const x = leftEdge - pad * (1.4 + i * 0.9) - pm(2);
        return (
          <g key={h}>
            <line x1={x} y1={0} x2={x} y2={-h} stroke={soft} strokeWidth={pm(0.2)} />
            <line x1={x - pm(1)} y1={0} x2={x + pm(1)} y2={0} stroke={soft} strokeWidth={pm(0.2)} />
            <line x1={x - pm(1)} y1={-h} x2={x + pm(1)} y2={-h} stroke={soft} strokeWidth={pm(0.2)} />
            <text transform={`translate(${x - pm(0.8)},${-h / 2}) rotate(-90)`} textAnchor="middle" fontSize={pm(2.6)} fill={ink}>{metres(h)}</text>
          </g>
        );
      })}

      {/* Beams (behind everything else) */}
      {showBeams && model.fixtures.filter(f => f.beam).map(f => (
        <g key={`b-${f.id}`}>
          <polygon points={`${f.beam.apex.u},${f.beam.apex.v} ${f.beam.rays[0].u},${f.beam.rays[0].v} ${f.beam.rays[1].u},${f.beam.rays[1].v}`}
            fill={f.colourHex || '#f5c542'} fillOpacity={0.14} stroke="none" />
          {f.beam.rays.map((r, i) => (
            <line key={i} x1={f.beam.apex.u} y1={f.beam.apex.v} x2={r.u} y2={r.v}
              stroke={f.colourHex || '#c9a227'} strokeOpacity={0.55} strokeWidth={pm(0.15)} strokeDasharray={`${pm(1.6)} ${pm(1)}`} />
          ))}
        </g>
      ))}

      {/* Pipes / trusses */}
      {model.pipes.map(p => (
        <g key={p.id}>
          {p.endOn ? (
            p.type === 'truss'
              ? <rect x={p.u1 - 150} y={p.v - 150} width={300} height={300} fill="white" stroke={ink} strokeWidth={pm(0.35)} />
              : <circle cx={p.u1} cy={p.v} r={24} fill="white" stroke={ink} strokeWidth={pm(0.35)} />
          ) : p.type === 'truss' ? (
            <g>
              <rect x={Math.min(p.u1, p.u2)} y={p.v - 150} width={Math.abs(p.u2 - p.u1)} height={300} fill="none" stroke={ink} strokeWidth={pm(0.3)} />
              {Array.from({ length: Math.max(1, Math.floor(Math.abs(p.u2 - p.u1) / 300)) }, (_, i) => {
                const x0 = Math.min(p.u1, p.u2) + i * 300;
                const x1 = Math.min(x0 + 300, Math.max(p.u1, p.u2));
                return <polyline key={i} points={`${x0},${p.v + 150} ${(x0 + x1) / 2},${p.v - 150} ${x1},${p.v + 150}`} fill="none" stroke={ink} strokeWidth={pm(0.15)} />;
              })}
            </g>
          ) : (
            <line x1={p.u1} y1={p.v} x2={p.u2} y2={p.v} stroke={ink} strokeWidth={Math.max(pm(0.5), 48)} strokeLinecap="butt" />
          )}
          {p.name && (
            <text x={Math.min(p.u1, p.u2)} y={p.v - (p.type === 'truss' ? 220 : 90)} fontSize={pm(2.6)} fill={ink} fontWeight="600">
              {p.name} · {metres(p.heightMm)}
            </text>
          )}
        </g>
      ))}

      {/* Fixtures */}
      {model.fixtures.map(f => (
        <g key={f.id}>
          <line x1={f.P.u} y1={f.P.v} x2={f.T.u} y2={f.T.v} stroke={ink} strokeWidth={pm(0.45)} />
          <rect x={f.P.u - 70} y={f.P.v - 10} width={140} height={50} fill="white" stroke={ink} strokeWidth={pm(0.25)} />
          <g transform={`rotate(${-f.alphaDeg} ${f.T.u} ${f.T.v})`}>
            <rect x={f.T.u - f.bodyW / 2} y={f.T.v - f.bodyH / 2} width={f.bodyW} height={f.bodyH} rx={f.bodyW * 0.12}
              fill={f.colourHex || 'white'} fillOpacity={f.colourHex ? 0.45 : 1} stroke={ink} strokeWidth={pm(0.35)} />
            <line x1={f.T.u - f.bodyW / 2} y1={f.T.v + f.bodyH / 2} x2={f.T.u + f.bodyW / 2} y2={f.T.v + f.bodyH / 2} stroke={ink} strokeWidth={pm(0.7)} />
          </g>
          <circle cx={f.T.u} cy={f.T.v} r={28} fill={ink} />
          {showLabels && f.label && (
            <text x={f.T.u + f.bodyW / 2 + pm(0.8)} y={f.T.v + pm(0.7)} fontSize={pm(2.6)} fill={ink}>{f.label}</text>
          )}
        </g>
      ))}

      {/* Infrastructure on the floor */}
      {model.infra.map(i => (
        <g key={i.id}>
          <rect x={i.u - 300} y={-300} width={600} height={300} fill="white" stroke={ink} strokeWidth={pm(0.3)} />
          {i.label && <text x={i.u} y={-380} textAnchor="middle" fontSize={pm(2.2)} fill={ink}>{i.label}</text>}
        </g>
      ))}
    </g>
  );
}

export function elevationLabel(vp) {
  const d = ELEV_DIRS[vp.elevDir || 'up'] || ELEV_DIRS.up;
  const band = vp.elevBand && Number.isFinite(vp.elevBand.min) && Number.isFinite(vp.elevBand.max)
    ? ` · Section ${Math.round(vp.elevBand.min)}…${Math.round(vp.elevBand.max)} mm` : '';
  return `${band ? 'Section' : 'Elevation'} (${d.label})${band}`;
}
