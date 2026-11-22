import { describe, it, expect } from 'vitest';
import {
  parseDmx, parseDmxStrict, validateDmx, syncFields, footprintOf,
  findDmxConflicts, findFreeAddress, planSequentialPatch,
} from '../src/patch/dmx';

describe('parseDmx', () => {
  it('parses universe/channel', () => {
    expect(parseDmx('2/101')).toEqual({ universe: 2, channel: 101 });
  });
  it('rejects malformed input', () => {
    expect(parseDmx('')).toBeNull();
    expect(parseDmx(null)).toBeNull();
    expect(parseDmx('101')).toBeNull();
    expect(parseDmx('1/2/3')).toBeNull();
    expect(parseDmx('a/b')).toBeNull();
  });
  it('strict variant enforces channel 1-512', () => {
    expect(parseDmxStrict('1/512')).toEqual({ universe: 1, channel: 512 });
    expect(parseDmxStrict('1/513')).toBeNull();
    expect(parseDmxStrict('1/0')).toBeNull();
  });
});

describe('validateDmx', () => {
  it('allows empty and valid', () => {
    expect(validateDmx('')).toBeNull();
    expect(validateDmx('1/1')).toBeNull();
  });
  it('explains errors', () => {
    expect(validateDmx('x')).toMatch(/Universe\/Channel/);
    expect(validateDmx('0/5')).toMatch(/Universe/);
    expect(validateDmx('1/600')).toMatch(/1–512/);
  });
});

describe('syncFields', () => {
  it('copies channel out of a DMX address edit', () => {
    expect(syncFields({ dmxAddress: '3/45' }, {})).toEqual({ dmxAddress: '3/45', channel: '45' });
  });
  it('rebuilds the address from a channel edit, keeping the universe', () => {
    expect(syncFields({ channel: '12' }, { dmxAddress: '4/1' })).toEqual({ channel: '12', dmxAddress: '4/12' });
  });
  it('defaults to universe 1 when the fixture is unpatched', () => {
    expect(syncFields({ channel: '7' }, {}).dmxAddress).toBe('1/7');
  });
  it('ignores out-of-range channels', () => {
    expect(syncFields({ channel: '999' }, {}).dmxAddress).toBeUndefined();
  });
});

describe('footprintOf', () => {
  const types = [{ id: 't1', defaultMode: 'Std', modes: [{ name: 'Std', channelCount: 16 }, { name: 'Ext', channelCount: 24 }] }];
  it('uses an explicit count first, then the mode, then 1', () => {
    expect(footprintOf({ dmxChannelCount: 5 }, types)).toBe(5);
    expect(footprintOf({ fixtureTypeId: 't1' }, types)).toBe(16);
    expect(footprintOf({ fixtureTypeId: 't1', dmxMode: 'Ext' }, types)).toBe(24);
    expect(footprintOf({ fixtureTypeId: 'none' }, types)).toBe(1);
  });
});

describe('findDmxConflicts', () => {
  it('flags overlapping ranges in the same universe only', () => {
    const c = findDmxConflicts([
      { id: 'a', dmxAddress: '1/10', dmxChannelCount: 4 },
      { id: 'b', dmxAddress: '1/13', dmxChannelCount: 2 },
      { id: 'c', dmxAddress: '2/10' },
      { id: 'd', dmxAddress: '1/20' },
    ]);
    expect([...c].sort()).toEqual(['a', 'b']);
  });
});

describe('findFreeAddress', () => {
  it('finds the first gap that fits', () => {
    const taken = [{ u: 1, s: 1, e: 10 }, { u: 1, s: 15, e: 20 }];
    expect(findFreeAddress(4, 1, taken)).toEqual({ universe: 1, channel: 11 });
    expect(findFreeAddress(5, 1, taken)).toEqual({ universe: 1, channel: 21 });
  });
  it('rolls into the next universe when full', () => {
    expect(findFreeAddress(10, 1, [{ u: 1, s: 1, e: 510 }])).toEqual({ universe: 2, channel: 1 });
  });
});

describe('planSequentialPatch', () => {
  it('steps by footprint and wraps universes at 512', () => {
    const fx = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const m = planSequentialPatch(fx, '1/500', () => 8);
    expect(m.get('a')).toBe('1/500');
    expect(m.get('b')).toBe('2/1');
    expect(m.get('c')).toBe('2/9');
  });
  it('returns null for a bad start address', () => {
    expect(planSequentialPatch([], 'nope')).toBeNull();
  });
});

describe('findDmxConflicts matches the brute-force definition', () => {
  const brute = (fixtures) => {
    const out = new Set();
    const rs = fixtures.map(f => { const p = parseDmxStrict(f.dmxAddress); return p && { id: f.id, u: p.universe, s: p.channel, e: p.channel + (f.dmxChannelCount || 1) - 1 }; }).filter(Boolean);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      if (rs[i].u === rs[j].u && rs[i].s <= rs[j].e && rs[j].s <= rs[i].e) { out.add(rs[i].id); out.add(rs[j].id); }
    }
    return out;
  };
  it('on random patches', () => {
    let seed = 12345;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let round = 0; round < 200; round++) {
      const fx = Array.from({ length: 1 + rnd(40) }, (_, i) => ({ id: 'f' + i, dmxAddress: `${1 + rnd(2)}/${1 + rnd(60)}`, dmxChannelCount: 1 + rnd(12) }));
      expect([...findDmxConflicts(fx)].sort()).toEqual([...brute(fx)].sort());
    }
  });
  it('handles thousands of fixtures quickly', () => {
    const fx = Array.from({ length: 20000 }, (_, i) => ({ id: 'f' + i, dmxAddress: `${1 + Math.floor(i / 400)}/${1 + (i % 400)}`, dmxChannelCount: 1 }));
    const t = Date.now();
    expect(findDmxConflicts(fx).size).toBe(0);
    expect(Date.now() - t).toBeLessThan(500);
  });
});
