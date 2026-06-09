/**
 * CablingLayer — renders cables, drop-point ticks, load warnings,
 * and flow animation dots inside the Canvas SVG world group.
 *
 * Props:
 *   cables         - project drawing cables array
 *   infrastructure - project drawing infrastructure array
 *   fixtures       - project drawing fixtures array
 *   pipes          - project drawing pipes (includes trusses)
 *   rigHeight      - project meta rigHeight (world units)
 *   zoom           - current canvas zoom
 *   selectedIds    - set of selected object ids (cables animate if attached item selected)
 *   animating      - boolean — show flow animation
 *   highlightCableIds - Set of cable ids to highlight
 */
import React, { useEffect, useRef, useState } from 'react';
import { calcCableRoute, formatLength, waypointsToPath } from '../cabling/routing';
import { CABLE_TYPES, calcCircuitLoad, wattsToAmps } from '../cabling/ratings';

// ── Colour by cable category ───────────────────────────────────────────────
function cableColor(cable) {
  const spec = CABLE_TYPES[cable.subtype];
  if (spec) return spec.color;
  if (cable.cableType === 'power')   return '#f59e0b';
  if (cable.cableType === 'dmx')     return '#a78bfa';
  if (cable.cableType === 'network') return '#34d399';
  return '#94a3b8';
}

// ── Dot animation along a path ─────────────────────────────────────────────
function AnimDot({ pathD, color, duration = 2, offset = 0 }) {
  return (
    <g>
      <circle r={2.5} fill={color} opacity={0.9}>
        <animateMotion dur={`${duration}s`} repeatCount="indefinite"
          begin={`${offset}s`}>
          <mpath href={`#${pathD}`} />
        </animateMotion>
      </circle>
    </g>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
// Returns true if this object is a power/dmx/network supply source
function isSupplyItem(obj, type) {
  if (type !== 'infra' || !obj) return false;
  return ['distro', 'node', 'netport', 'switch'].includes(obj.type);
}

export default function CablingLayer({
  cables = [],
  infrastructure = [],
  fixtures = [],
  pipes = [],
  rigHeight = 5500,
  gridHeight = 6000,
  zoom = 1,
  selectedIds = new Set(),
  animating = false,
  highlightCableIds = new Set(),
  onCableClick,
}) {
  // Build lookup maps
  const fixtureMap = {};
  fixtures.forEach(f => { fixtureMap[f.id] = f; });
  const infraMap = {};
  infrastructure.forEach(i => { infraMap[i.id] = i; });

  function getPos(id, type) {
    if (type === 'fixture') return fixtureMap[id];
    if (type === 'infra')   return infraMap[id];
    return null;
  }

  // For each cable, compute route
  const routedCables = cables.map(cable => {
    const fromObj = getPos(cable.fromId, cable.fromType);
    const toObj   = getPos(cable.toId,   cable.toType);
    if (!fromObj || !toObj) return null;

    const from = { x: fromObj.x, y: fromObj.y, onStructureId: fromObj.onStructureId || null };
    const to   = { x: toObj.x,   y: toObj.y,   onStructureId: toObj.onStructureId   || null };

    const { waypoints, dropPoints, lengthMm } = calcCableRoute(from, to, pipes, rigHeight, gridHeight);

    // Determine if this cable is "active" (attached to selected item)
    const isHighlighted = highlightCableIds.has(cable.id)
      || selectedIds.has(cable.fromId)
      || selectedIds.has(cable.toId);

    // Load warning for power cables
    let overloaded = false;
    if (cable.cableType === 'power') {
      const chainFixtures = [];
      if (cable.fromType === 'fixture') chainFixtures.push(fromObj);
      if (cable.toType   === 'fixture') chainFixtures.push(toObj);
      if (cable.subtype) {
        const load = calcCircuitLoad(chainFixtures, cable.subtype);
        overloaded = load.overloaded;
      }
    }

    // Animation direction: always source → load
    // Supply items: distro, node, netport, switch (infra). Load = fixture.
    // If "to" is the supply and "from" is the load, reverse waypoints for animation.
    const fromIsSupply = isSupplyItem(fromObj, cable.fromType);
    const toIsSupply   = isSupplyItem(toObj,   cable.toType);
    const animWaypoints = (toIsSupply && !fromIsSupply) ? [...waypoints].reverse() : waypoints;

    const color    = cableColor(cable);
    const pathId   = `cable-path-${cable.id}`;
    const pointsStr = waypoints.map(p => `${p.x},${p.y}`).join(' ');
    const pathD    = waypointsToPath(waypoints);
    const animPathD = waypointsToPath(animWaypoints);

    return { cable, waypoints, dropPoints, lengthMm, isHighlighted, overloaded, color, pathId, pointsStr, pathD, animPathD };
  }).filter(Boolean);

  const sw = (v) => v / zoom; // scale with zoom (for stroke widths etc.)

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Hidden path defs for animateMotion */}
      <defs>
        {animating && routedCables.filter(r => r.isHighlighted).map(({ pathId, pathD }) => (
          <path key={pathId} id={pathId} d={pathD} fill="none" />
        ))}
      </defs>

      {routedCables.map(({ cable, waypoints, dropPoints, lengthMm, isHighlighted, overloaded, color, pathId, pointsStr, pathD, animPathD }) => {
        const alpha = isHighlighted ? 1 : 0.4;
        const sw1   = isHighlighted ? 2.5 / zoom : 1.2 / zoom;
        const strokeColor = overloaded ? '#ef4444' : color;

        return (
          <g key={cable.id} style={{ pointerEvents: 'visibleStroke', cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onCableClick && onCableClick(cable); }}>

            {/* Cable line */}
            <polyline
              points={pointsStr}
              fill="none"
              stroke={strokeColor}
              strokeWidth={sw1}
              strokeOpacity={alpha}
              strokeDasharray={
                cable.cableType === 'dmx'     ? `${4/zoom} ${2/zoom}` :
                cable.cableType === 'network' ? `${6/zoom} ${2/zoom} ${1/zoom} ${2/zoom}` :
                'none'
              }
            />

            {/* Overload warning flash */}
            {overloaded && (
              <polyline points={pointsStr} fill="none"
                stroke="#ef4444" strokeWidth={4/zoom} strokeOpacity={0.25}
                strokeDasharray={`${8/zoom} ${4/zoom}`} />
            )}

            {/* Drop point ticks (vertical ↕ indicator where cable drops from rig) */}
            {dropPoints.map((dp, i) => (
              <g key={i}>
                <line x1={dp.x - 4/zoom} y1={dp.y} x2={dp.x + 4/zoom} y2={dp.y}
                  stroke={strokeColor} strokeWidth={1.5/zoom} strokeOpacity={alpha} />
                <line x1={dp.x} y1={dp.y - 6/zoom} x2={dp.x} y2={dp.y + 6/zoom}
                  stroke={strokeColor} strokeWidth={1.5/zoom} strokeOpacity={alpha} />
              </g>
            ))}

            {/* Label: length + overload */}
            {isHighlighted && waypoints.length >= 2 && (() => {
              const mx = (waypoints[0].x + waypoints[waypoints.length - 1].x) / 2;
              const my = (waypoints[0].y + waypoints[waypoints.length - 1].y) / 2;
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={mx - 16/zoom} y={my - 8/zoom} width={32/zoom} height={10/zoom}
                    rx={2/zoom} fill="#0d1117" fillOpacity={0.8} />
                  <text x={mx} y={my - 1/zoom} textAnchor="middle"
                    fontSize={7/zoom} fill={overloaded ? '#ef4444' : '#e0e0e0'}>
                    {formatLength(lengthMm)}{overloaded ? ' ⚠' : ''}
                  </text>
                </g>
              );
            })()}

            {/* Flow animation dots */}
            {animating && isHighlighted && waypoints.length >= 2 && [0, 0.4, 0.8].map((offset, i) => {
              const duration = cable.cableType === 'network' ? 1.2 : cable.cableType === 'dmx' ? 1.8 : 2.5;
              const totalLen = lengthMm / 1000; // approximate
              return (
                <circle key={i} r={2.2/zoom} fill={strokeColor} opacity={0.9}>
                  <animateMotion
                    dur={`${duration}s`}
                    begin={`${-offset * duration}s`}
                    repeatCount="indefinite"
                    path={animPathD}
                  />
                </circle>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
