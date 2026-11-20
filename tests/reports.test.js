import { describe, it, expect } from 'vitest';
import { buildInstrumentSchedule, buildChannelHookup, buildDimmerSchedule, fixturesToCSV, INSTRUMENT_COLUMNS } from '../src/paperwork/reports';

const fx = [
  { id: 1, position: '2 Electric', unit: '3', channel: '20', dimmer: '5', type: 'S4 19' },
  { id: 2, position: '1 Electric', unit: '2', channel: '', dimmer: '1', type: 'Fresnel' },
  { id: 3, position: '1 Electric', unit: '1', channel: '10', dimmer: '', type: 'PC' },
];

describe('reports', () => {
  it('sorts the instrument schedule by position then unit', () => {
    expect(buildInstrumentSchedule(fx).map(f => f.id)).toEqual([3, 2, 1]);
  });
  it('sorts the hookup by channel with unpatched last', () => {
    expect(buildChannelHookup(fx).map(f => f.id)).toEqual([3, 1, 2]);
  });
  it('sorts the dimmer schedule by dimmer with blanks last', () => {
    expect(buildDimmerSchedule(fx).map(f => f.id)).toEqual([2, 1, 3]);
  });
  it('does not mutate its input', () => {
    const copy = [...fx];
    buildInstrumentSchedule(fx);
    expect(fx).toEqual(copy);
  });
  it('builds CSV with a header row', () => {
    const csv = fixturesToCSV([{ position: 'A', unit: 1 }], INSTRUMENT_COLUMNS.slice(0, 2));
    expect(csv.split('\n')).toEqual(['Position,Unit#', '"A",1']);
  });
});
