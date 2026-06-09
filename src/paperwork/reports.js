export function buildInstrumentSchedule(fixtures) {
  return [...fixtures].sort((a, b) => {
    const pos = (a.position || '').localeCompare(b.position || '');
    if (pos !== 0) return pos;
    return (Number(a.unit) || 0) - (Number(b.unit) || 0);
  });
}

export function buildChannelHookup(fixtures) {
  return [...fixtures].sort((a, b) => (Number(a.channel) || 9999) - (Number(b.channel) || 9999));
}

export function buildDimmerSchedule(fixtures) {
  return [...fixtures].sort((a, b) => (Number(a.dimmer) || 9999) - (Number(b.dimmer) || 9999));
}

export function fixturesToCSV(fixtures, columns) {
  const header = columns.map(c => c.label).join(',');
  const rows = fixtures.map(f =>
    columns.map(c => JSON.stringify(f[c.key] ?? '')).join(',')
  );
  return [header, ...rows].join('\n');
}

export const INSTRUMENT_COLUMNS = [
  { key: 'position', label: 'Position' },
  { key: 'unit', label: 'Unit#' },
  { key: 'type', label: 'Type' },
  { key: 'channel', label: 'Channel' },
  { key: 'dimmer', label: 'Dimmer' },
  { key: 'colour', label: 'Colour' },
  { key: 'gobo', label: 'Gobo' },
  { key: 'purpose', label: 'Purpose' },
];
