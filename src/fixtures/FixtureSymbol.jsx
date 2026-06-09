import React from 'react';

export default function FixtureSymbol({ fixtureType, unit, channel, selected, rotation = 0, scale = 1, colourHex }) {
  if (!fixtureType) return null;

  const color = selected ? '#00aaff' : '#e0e0e0';
  const labelColor = selected ? '#00aaff' : '#ffffff';
  const subColor = selected ? '#80ccff' : '#a0aec0';

  return (
    <g transform={`rotate(${rotation}) scale(${scale})`} style={{ color }}>
      <g dangerouslySetInnerHTML={{ __html: fixtureType.symbol }} />
      {/* Colour swatch — small filled circle at top of symbol */}
      {colourHex && (
        <circle cx={0} cy={-14} r={4} fill={colourHex} stroke={selected ? '#00aaff' : 'rgba(0,0,0,0.4)'} strokeWidth={0.5} />
      )}
      {unit && (
        <text x="0" y="28" textAnchor="middle" fontSize="10" fill={labelColor}
          style={{ userSelect: 'none', pointerEvents: 'none' }}>
          {unit}
        </text>
      )}
      {channel && (
        <text x="0" y="38" textAnchor="middle" fontSize="8" fill={subColor}
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
