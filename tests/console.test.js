import { describe, it, expect } from 'vitest';
import { buildEosPatchTxt, EOS_COLUMNS } from '../src/console/eosExport';
import { layoutMagicSheet, magicSheetCsv, EOS_MAX_IMAGE } from '../src/console/magicSheet';

describe('buildEosPatchTxt', () => {
  const fixtures = [
    { id: 'b', channel: '20', dmxAddress: '1/21', position: '2 Electric', unit: '3', colour: 'R26', purpose: 'Front\tlight', type: 'S4 19' },
    { id: 'a', channel: '5', dmxAddress: '1/5', position: '1 Electric', unit: '1', colour: 'L201', purpose: 'Wash', type: 'Fresnel' },
    { id: 'c', position: 'Floor' },
  ];

  it('is tab-delimited with CRLF endings and a header row', () => {
    const { text } = buildEosPatchTxt(fixtures);
    expect(text.endsWith('\r\n')).toBe(true);
    const lines = text.trim().split('\r\n');
    expect(lines[0].split('\t')).toEqual(EOS_COLUMNS);
    expect(lines).toHaveLength(3);
  });

  it('includes the columns Eos reads and marks every row as a Light', () => {
    const { text } = buildEosPatchTxt(fixtures);
    const [header, ...rows] = text.trim().split('\r\n').map(l => l.split('\t'));
    const col = (row, name) => row[header.indexOf(name)];
    expect(col(rows[0], 'Channel')).toBe('5');           // sorted by channel
    expect(col(rows[0], 'Dimmer')).toBe('1/5');
    expect(col(rows[0], 'Color')).toBe('L201');
    expect(col(rows[0], 'Circuit Name')).toBe('1 Electric');
    expect(col(rows[0], 'Circuit#')).toBe('1');
    expect(rows.every(r => col(r, 'Device Type') === 'Light')).toBe(true);
  });

  it('keeps tabs and newlines out of cell values', () => {
    const { text } = buildEosPatchTxt(fixtures);
    expect(text).toContain('Front light');
    const first = text.trim().split('\r\n')[2].split('\t');
    expect(first).toHaveLength(EOS_COLUMNS.length);
  });

  it('skips unpatched fixtures unless asked and reports the counts', () => {
    expect(buildEosPatchTxt(fixtures)).toMatchObject({ exported: 2, skipped: 1 });
    expect(buildEosPatchTxt(fixtures, { includeUnpatched: true })).toMatchObject({ exported: 3, skipped: 0 });
  });
});

describe('layoutMagicSheet', () => {
  const drawing = {
    pipes: [{ x1: 0, y1: 0, x2: 10000, y2: 0, name: '1 Electric' }],
    fixtures: [
      { id: 'a', x: 0, y: 0, channel: '1' },
      { id: 'b', x: 10000, y: 0, channel: '2' },
      { id: 'c', x: 5000, y: 2500, channel: ' 3 ', unit: '9', position: 'P' },
    ],
  };

  it('fits inside the Eos 1920 x 1920 image limit, keeping aspect', () => {
    const l = layoutMagicSheet(drawing);
    expect(l.width).toBeLessThanOrEqual(EOS_MAX_IMAGE);
    expect(l.height).toBeLessThanOrEqual(EOS_MAX_IMAGE);
    expect(l.width).toBe(EOS_MAX_IMAGE);                      // widest axis uses the full width
    expect(l.height / l.width).toBeCloseTo((2500 * l.scale + 120) / l.width, 2);
  });

  it('maps fixtures to pixel positions with the margin applied', () => {
    const l = layoutMagicSheet(drawing, { margin: 60 });
    const a = l.items.find(i => i.id === 'a'), b = l.items.find(i => i.id === 'b');
    expect(a.x).toBe(60);
    expect(b.x).toBe(l.width - 60);
    expect(l.items.find(i => i.id === 'c').channel).toBe('3');   // trimmed
  });

  it('handles an empty drawing', () => {
    expect(layoutMagicSheet({}).empty).toBe(true);
  });

  it('writes a CSV sorted by channel', () => {
    const csv = magicSheetCsv(layoutMagicSheet(drawing)).trim().split('\r\n');
    expect(csv[0]).toBe('Channel,Unit,Position,Type,X_px,Y_px');
    expect(csv.slice(1).map(r => r.split(',')[0])).toEqual(['"1"', '"2"', '"3"']);
  });
});
