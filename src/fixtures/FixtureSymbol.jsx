import React from 'react';

export default function FixtureSymbol({ fixtureType, unit, channel, selected, rotation = 0, scale = 1, colourHex }) {
  if (!fixtureType) return null;

  const color = selected ? '#00aaff' : '#e0e0e0';
  const labelColor = selected ? '#00aaff' : '#ffffff';
  const subColor = selected ? '#80ccff' : '#a0aec0';
  const sc = scale || 1;

  return (
    <g>
      {/* Symbol and colour swatch rotate with fixture */}
      <g transform={`rotate(${rotation}) scale(${sc})`} style={{ color }}>
        <g dangerouslySetInnerHTML={{ __html: fixtureType.symbol }} />
        {colourHex && (
          <circle cx={0} cy={-14} r={4} fill={colourHex} stroke={selected ? '#00aaff' : 'rgba(0,0,0,0.4)'} strokeWidth={0.5} />
        )}
      </g>
      {/* Text labels always remain upright on screen regardless of fixture rotation */}
      {unit && (
        <text x="0" y={28 * sc} textAnchor="middle" fontSize={10 * sc} fill={labelColor}
          style={{ userSelect: 'none', pointerEvents: 'none' }}>
          {unit}
        </text>
      )}
      {channel && (
        <text x="0" y={40 * sc} textAnchor="middle" fontSize={8 * sc} fill={subColor}
          style={{ userSelect: 'none', pointerEvents: 'none' }}>
          Ch {channel}
        </text>
      )}
    </g>
  );
}

export function FixturePreview({ fixtureType, colourHex }) {
  if (!fixtureType) return null;
  return (
    <svg
      viewBox={fixtureType.symbolViewBox}
      width="36"
      height="36"
      style={{ color: '#e0e0e0', display: 'block' }}
    >
      <g dangerouslySetInnerHTML={{ __html: fixtureType.symbol }} />
      {colourHex && <circle cx={0} cy={-14} r={4} fill={colourHex} stroke="rgba(0,0,0,0.4)" strokeWidth={0.5} />}
    </svg>
  );
}
