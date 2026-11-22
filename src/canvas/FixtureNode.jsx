import React from 'react';
import FixtureSymbol from '../fixtures/FixtureSymbol';
import { beamFootprint } from './beam';
import { fixtureLabel } from './canvasHelpers';

/**
 * One fixture on the plot canvas: beam footprint, symbol, label and overlays.
 *
 * Memoised with a field-by-field comparison of the fixture, so mouse-move /
 * hover / cursor updates (which re-render the whole canvas) leave every fixture
 * that didn't change untouched — the difference between a smooth and an
 * unusable plot with thousands of fixtures. Because a project commit deep-clones
 * every object, the comparison is by value, not by identity.
 *
 * lod (level of detail): 0 full · 1 symbol only (no label / beam) · 2 a simple dot.
 */

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

function propsEqual(prev, next) {
  for (const k in next) {
    if (k === 'f') { if (!shallowEqual(prev.f, next.f)) return false; }
    else if (prev[k] !== next[k]) return false;
  }
  return true;
}

function Beam({ f, ftype, zoom, height, focusPreview }) {
  const beamDeg = f.beamAngle ?? ftype?.beamAngle ?? 0;
  const tiltDeg = focusPreview ? focusPreview.tilt : (f.tiltAngle ?? 0);
  const fxRot = focusPreview ? focusPreview.rotation : (f.rotation || 0);
  const fp = beamFootprint({ beamDeg, tiltDeg, rotationDeg: fxRot, height });
  if (!fp) return null;
  const { cx, cy, rMajor, rMinor, dirX, dirY } = fp;
  const px = -dirY, py = dirX;                                       // perpendicular unit
  const colour = f.colourHex && f.colourHex !== 'null' ? f.colourHex : '#ffd86b';
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={0} y1={0} x2={cx + px * rMinor} y2={cy + py * rMinor}
        stroke={colour} strokeWidth={0.8 / zoom} strokeOpacity={0.45} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
      <line x1={0} y1={0} x2={cx - px * rMinor} y2={cy - py * rMinor}
        stroke={colour} strokeWidth={0.8 / zoom} strokeOpacity={0.45} strokeDasharray={`${4 / zoom} ${3 / zoom}`} />
      <ellipse cx={cx} cy={cy} rx={rMinor} ry={rMajor}
        transform={`rotate(${(fxRot + 180)} ${cx} ${cy})`}
        fill={colour} fillOpacity={0.10}
        stroke={colour} strokeWidth={1 / zoom} strokeOpacity={0.55} />
    </g>
  );
}

function FixtureNodeImpl({ f, ftype, sel, zoom, labelMode, showBeam, beamHeight, focusPreview, isFocus, conflict, lod, symId }) {
  if (lod === 2) {
    // Zoomed far out: one dot per fixture.
    return (
      <g transform={`translate(${f.x},${f.y})`} style={{ pointerEvents: 'none' }}>
        <circle r={4 / zoom} fill={f.colourHex && f.colourHex !== 'null' ? f.colourHex : '#d9dee7'} fillOpacity={0.9} />
      </g>
    );
  }
  const full = lod === 0;
  return (
    <g transform={`translate(${f.x},${f.y})`} style={{ cursor: f.locked ? 'not-allowed' : 'pointer', opacity: f.locked ? 0.6 : 1 }}>
      {(full && showBeam) || focusPreview
        ? <Beam f={f} ftype={ftype} zoom={zoom} height={beamHeight} focusPreview={focusPreview} />
        : null}
      <g transform={`scale(${1 / zoom})`}>
        <FixtureSymbol fixtureType={ftype} unit={full ? fixtureLabel(f, labelMode) : null} channel={null} selected={sel}
          rotation={f.rotation || 0} scale={f.scale || 1} colourHex={f.colourHex || null}
          symbolOverride={f.symbolOverride || null} symbolColor={f.symbolColor || null} symId={symId} />
      </g>
      {conflict && <circle cx={0} cy={0} r={16 / zoom} fill="none" stroke="#fc8181" strokeWidth={2 / zoom} strokeOpacity={0.85} style={{ pointerEvents: 'none' }} />}
      {isFocus && <circle cx={0} cy={0} r={6 / zoom} fill="none" stroke="#ffaa00" strokeWidth={2 / zoom} strokeDasharray={`${3 / zoom} ${2 / zoom}`} />}
      {f.locked && <text x={0} y={-20 / zoom} textAnchor="middle" fontSize={12 / zoom} fill="rgba(255,255,255,0.7)" style={{ userSelect: 'none', pointerEvents: 'none' }}>🔒</text>}
    </g>
  );
}

const FixtureNode = React.memo(FixtureNodeImpl, propsEqual);
export default FixtureNode;

/** Fixture symbols are defined once in <defs> and referenced with <use>, instead of repeating their markup per fixture. */
export const SymbolDefs = React.memo(function SymbolDefs({ symIds, fixtureTypes }) {
  return (
    <defs>
      {fixtureTypes.filter(t => symIds.has(t.id)).map(t => (
        <g key={t.id} id={symIds.get(t.id)} dangerouslySetInnerHTML={{ __html: t.symbol }} />
      ))}
    </defs>
  );
});

/** typeId → a document-unique, selector-safe id for its <defs> symbol. */
export function buildSymIds(fixtureTypes) {
  const m = new Map();
  (fixtureTypes || []).forEach((t, i) => { if (t && t.symbol) m.set(t.id, `fxsym-${i}`); });
  return m;
}

/** Fixtures inside the visible world rectangle (plus a margin for big beam pools), keeping array order. */
export function cullFixtures(fixtures, view, selected) {
  if (!view) return fixtures;
  return fixtures.filter(f => (selected && selected.has(f.id)) || (f.x >= view.x0 && f.x <= view.x1 && f.y >= view.y0 && f.y <= view.y1));
}

/** Which level of detail to draw at, given how many fixtures are on screen. */
export function lodFor(visibleCount) {
  return visibleCount > 2500 ? 2 : visibleCount > 900 ? 1 : 0;
}
