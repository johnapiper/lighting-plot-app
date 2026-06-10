import JSZip from 'jszip';
import { generateId } from '../canvas/geometry';

// ── Symbol catalogue ─ exported so other components can offer a picker ─────────
// All symbols drawn front-face (lens toward viewer), c-clamp stub at top.
export const SYMBOL_CATALOGUE = [

  // ── Profile / ERS ──────────────────────────────────────────────────────────

  {
    // ETC Source Four (S4) / generic ERS — distinctive 4-shutter-blade aperture
    id: 'S4Profile',
    label: 'ETC S4 Profile',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-13' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='12' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='6' fill='none' stroke='currentColor' stroke-width='1'/><line x1='0' y1='-12' x2='0' y2='-7' stroke='currentColor' stroke-width='2'/><line x1='0' y1='12' x2='0' y2='7' stroke='currentColor' stroke-width='2'/><line x1='-12' y1='0' x2='-7' y2='0' stroke='currentColor' stroke-width='2'/><line x1='12' y1='0' x2='7' y2='0' stroke='currentColor' stroke-width='2'/>",
    symbolViewBox: '-18 -22 36 44',
  },
  {
    // ETC Source Four Jr — same 4-blade style, slightly smaller barrel
    id: 'S4Jr',
    label: 'ETC S4 Jr',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-11' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='10' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='5' fill='none' stroke='currentColor' stroke-width='1'/><line x1='0' y1='-10' x2='0' y2='-6' stroke='currentColor' stroke-width='2'/><line x1='0' y1='10' x2='0' y2='6' stroke='currentColor' stroke-width='2'/><line x1='-10' y1='0' x2='-6' y2='0' stroke='currentColor' stroke-width='2'/><line x1='10' y1='0' x2='6' y2='0' stroke='currentColor' stroke-width='2'/>",
    symbolViewBox: '-16 -22 32 40',
  },
  {
    // Generic Profile / Leko — tapered body, lens cap, no shutter marks (older style)
    id: 'Profile',
    label: 'Profile / ERS',
    symbol: "<line x1='0' y1='-21' x2='0' y2='-15' stroke='currentColor' stroke-width='1.5'/><ellipse cx='0' cy='0' rx='10' ry='15' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-10' y1='10' x2='10' y2='10' stroke='currentColor' stroke-width='1.5'/><line x1='-8' y1='1' x2='8' y2='1' stroke='currentColor' stroke-width='1'/>",
    symbolViewBox: '-16 -23 32 46',
  },

  // ── Fresnel / PC ───────────────────────────────────────────────────────────

  {
    // Fresnel — concentric step-lens rings are the identifier
    id: 'Fresnel',
    label: 'Fresnel',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-14' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='10' fill='none' stroke='currentColor' stroke-width='0.8'/><circle cx='0' cy='0' r='6' fill='none' stroke='currentColor' stroke-width='0.8'/><circle cx='0' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='0.8'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  {
    // PC Spot (Plano-Convex) — parallel horizontal lines across lens face
    id: 'PcSpot',
    label: 'PC Spot',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-14' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-11' y1='-6' x2='11' y2='-6' stroke='currentColor' stroke-width='0.9'/><line x1='-13' y1='0' x2='13' y2='0' stroke='currentColor' stroke-width='0.9'/><line x1='-11' y1='6' x2='11' y2='6' stroke='currentColor' stroke-width='0.9'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  {
    // Spot / generic Patt-style (older ellipse-body style kept for compatibility)
    id: 'Spot',
    label: 'Spot (traditional)',
    symbol: "<line x1='0' y1='-21' x2='0' y2='-15' stroke='currentColor' stroke-width='1.5'/><ellipse cx='0' cy='0' rx='10' ry='15' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-10' y1='10' x2='10' y2='10' stroke='currentColor' stroke-width='1.5'/><line x1='-7' y1='13' x2='-7' y2='17' stroke='currentColor' stroke-width='1.5'/><line x1='7' y1='13' x2='7' y2='17' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-16 -23 32 50',
  },

  // ── PAR cans ───────────────────────────────────────────────────────────────

  {
    // ETC Source Four PAR — S4 body with PAR lamp (cross-filament pattern)
    id: 'S4Par',
    label: 'ETC S4 PAR',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-13' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='12' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='8' fill='none' stroke='currentColor' stroke-width='1'/><line x1='-6' y1='-6' x2='6' y2='6' stroke='currentColor' stroke-width='1'/><line x1='6' y1='-6' x2='-6' y2='6' stroke='currentColor' stroke-width='1'/>",
    symbolViewBox: '-18 -22 36 44',
  },
  {
    // PAR 64 — large can, prominent outer rim, inner lamp circle with filament X
    id: 'Par64',
    label: 'PAR 64',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-14' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='2'/><circle cx='0' cy='0' r='9' fill='none' stroke='currentColor' stroke-width='1'/><line x1='-6' y1='-6' x2='6' y2='6' stroke='currentColor' stroke-width='1'/><line x1='6' y1='-6' x2='-6' y2='6' stroke='currentColor' stroke-width='1'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  {
    // PAR 36 / Birdie — compact version of PAR 64
    id: 'Par36',
    label: 'PAR 36 / Birdie',
    symbol: "<line x1='0' y1='-18' x2='0' y2='-10' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='10' fill='none' stroke='currentColor' stroke-width='2'/><circle cx='0' cy='0' r='5' fill='none' stroke='currentColor' stroke-width='1'/><line x1='-3' y1='-3' x2='3' y2='3' stroke='currentColor' stroke-width='1'/><line x1='3' y1='-3' x2='-3' y2='3' stroke='currentColor' stroke-width='1'/>",
    symbolViewBox: '-16 -20 32 36',
  },

  // ── Wash / LED ─────────────────────────────────────────────────────────────

  {
    // LED Wash / LED PAR — multi-LED array (dot grid)
    id: 'Wash',
    label: 'Wash / LED Par',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-14' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='-5' cy='-5' r='2' fill='currentColor'/><circle cx='5' cy='-5' r='2' fill='currentColor'/><circle cx='-5' cy='5' r='2' fill='currentColor'/><circle cx='5' cy='5' r='2' fill='currentColor'/><circle cx='0' cy='0' r='2' fill='currentColor'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  {
    // LED Bar (5-cell) — horizontal bar with individual LEDs
    id: 'LedBar',
    label: 'LED Bar',
    symbol: "<line x1='0' y1='-13' x2='0' y2='-7' stroke='currentColor' stroke-width='1.5'/><rect x='-24' y='-6' width='48' height='12' rx='2' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='-16' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/><circle cx='-8' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/><circle cx='0' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/><circle cx='8' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/><circle cx='16' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/>",
    symbolViewBox: '-28 -16 56 30',
  },
  {
    // Strip / Batten — 3-cell colour mixing strip
    id: 'Strip',
    label: 'Strip / Batten',
    symbol: "<line x1='0' y1='-14' x2='0' y2='-7' stroke='currentColor' stroke-width='1.5'/><rect x='-22' y='-6' width='44' height='13' rx='2' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-7' y1='-6' x2='-7' y2='7' stroke='currentColor' stroke-width='1'/><line x1='7' y1='-6' x2='7' y2='7' stroke='currentColor' stroke-width='1'/><circle cx='-14' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/><circle cx='0' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/><circle cx='14' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/>",
    symbolViewBox: '-26 -17 52 36',
  },

  // ── Beam ───────────────────────────────────────────────────────────────────

  {
    // Beam / ACL / Pinspot — tight beam, two concentric circles
    id: 'Beam',
    label: 'Beam / ACL',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-14' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='7' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='2' fill='currentColor'/>",
    symbolViewBox: '-20 -22 40 44',
  },

  // ── Floods & Cycs ─────────────────────────────────────────────────────────

  {
    // Scoop — D-shaped reflector with lamp inside
    id: 'Scoop',
    label: 'Scoop',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-14' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-14' x2='0' y2='14' stroke='currentColor' stroke-width='1.5'/><path d='M0,-14 A14,14 0 0,1 0,14' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='6' cy='0' r='4' fill='none' stroke='currentColor' stroke-width='1'/>",
    symbolViewBox: '-4 -22 24 44',
  },
  {
    // Flood / Blinder — wide rectangular housing, single lamp
    id: 'Flood',
    label: 'Flood / Blinder',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-12' stroke='currentColor' stroke-width='1.5'/><rect x='-16' y='-12' width='32' height='24' rx='2' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='8' fill='none' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  {
    // Cyc Light / Ground Row — 4-cell wide strip with curved cell tops
    id: 'CycLight',
    label: 'Cyc / Ground Row',
    symbol: "<line x1='0' y1='-16' x2='0' y2='-9' stroke='currentColor' stroke-width='1.5'/><rect x='-26' y='-8' width='52' height='16' rx='2' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-13' y1='-8' x2='-13' y2='8' stroke='currentColor' stroke-width='1'/><line x1='0' y1='-8' x2='0' y2='8' stroke='currentColor' stroke-width='1'/><line x1='13' y1='-8' x2='13' y2='8' stroke='currentColor' stroke-width='1'/><circle cx='-19' cy='0' r='4' fill='none' stroke='currentColor' stroke-width='0.9'/><circle cx='-6' cy='0' r='4' fill='none' stroke='currentColor' stroke-width='0.9'/><circle cx='7' cy='0' r='4' fill='none' stroke='currentColor' stroke-width='0.9'/><circle cx='20' cy='0' r='4' fill='none' stroke='currentColor' stroke-width='0.9'/>",
    symbolViewBox: '-30 -18 60 34',
  },

  // ── Moving Lights ─────────────────────────────────────────────────────────

  {
    // Moving Head (Profile) — yoke mount with shutter aperture indicator
    id: 'MovingHead',
    label: 'Moving Head (Profile)',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-12' stroke='currentColor' stroke-width='1.5'/><line x1='-18' y1='0' x2='-12' y2='0' stroke='currentColor' stroke-width='2'/><line x1='12' y1='0' x2='18' y2='0' stroke='currentColor' stroke-width='2'/><circle cx='-18' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='18' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='12' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='5' fill='none' stroke='currentColor' stroke-width='1'/><line x1='0' y1='-12' x2='0' y2='-7' stroke='currentColor' stroke-width='1.8'/><line x1='0' y1='12' x2='0' y2='7' stroke='currentColor' stroke-width='1.8'/><line x1='-12' y1='0' x2='-7' y2='0' stroke='currentColor' stroke-width='1.8'/><line x1='12' y1='0' x2='7' y2='0' stroke='currentColor' stroke-width='1.8'/>",
    symbolViewBox: '-24 -22 48 44',
  },
  {
    // Moving Wash — yoke mount, LED dot array face
    id: 'MovingWash',
    label: 'Moving Wash',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-12' stroke='currentColor' stroke-width='1.5'/><line x1='-18' y1='0' x2='-12' y2='0' stroke='currentColor' stroke-width='2'/><line x1='12' y1='0' x2='18' y2='0' stroke='currentColor' stroke-width='2'/><circle cx='-18' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='18' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='12' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='-4' cy='-4' r='1.8' fill='currentColor'/><circle cx='4' cy='-4' r='1.8' fill='currentColor'/><circle cx='-4' cy='4' r='1.8' fill='currentColor'/><circle cx='4' cy='4' r='1.8' fill='currentColor'/><circle cx='0' cy='0' r='1.8' fill='currentColor'/>",
    symbolViewBox: '-24 -22 48 44',
  },

  // ── Followspot ────────────────────────────────────────────────────────────

  {
    // Followspot — elongated horizontal body, large objective lens at front, eyepiece at rear
    id: 'Followspot',
    label: 'Followspot',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-8' stroke='currentColor' stroke-width='1.5'/><ellipse cx='0' cy='0' rx='20' ry='8' fill='none' stroke='currentColor' stroke-width='1.5'/><ellipse cx='-13' cy='0' rx='5' ry='7' fill='none' stroke='currentColor' stroke-width='1'/><circle cx='14' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/>",
    symbolViewBox: '-26 -22 52 30',
  },

  // ── Special effects ───────────────────────────────────────────────────────

  {
    // Hazer / Fogger — rectangular box, wavy emission lines from top
    id: 'Hazer',
    label: 'Hazer / Fogger',
    symbol: "<rect x='-14' y='-8' width='28' height='18' rx='3' fill='none' stroke='currentColor' stroke-width='1.5'/><path d='M-8,-8 Q-6,-14 -4,-10 Q-2,-6 0,-12 Q2,-16 4,-10 Q6,-6 8,-8' fill='none' stroke='currentColor' stroke-width='1' stroke-linecap='round'/><line x1='0' y1='10' x2='0' y2='18' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-18 -18 36 38',
  },
  {
    // Blinder (single-cell) — square housing, large exposed lamp
    id: 'Blinder',
    label: 'Blinder',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-13' stroke='currentColor' stroke-width='1.5'/><rect x='-13' y='-13' width='26' height='26' rx='2' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='8' fill='none' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-18 -22 36 44',
  },

  // ── Generic ───────────────────────────────────────────────────────────────

  {
    id: 'Generic',
    label: 'Generic',
    symbol: "<line x1='0' y1='-20' x2='0' y2='-14' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -22 40 44',
  },
];

const DEFAULT_SYMBOL = SYMBOL_CATALOGUE.find(s => s.id === 'Generic');

function symbolForCategory(category = '') {
  const lc = category.toLowerCase();
  // Explicit keyword → symbol mapping (checked first)
  const keywordMap = [
    { keys: ['s4', 'source four', 'source 4', 'leko', 'ers'],      id: 'S4Profile' },
    { keys: ['s4 jr', 'source four jr', 'junior'],                   id: 'S4Jr' },
    { keys: ['s4 par', 'source four par'],                           id: 'S4Par' },
    { keys: ['par 64', 'par64', 'par can'],                          id: 'Par64' },
    { keys: ['par 36', 'par36', 'birdie', 'inkie'],                  id: 'Par36' },
    { keys: ['fresnel'],                                              id: 'Fresnel' },
    { keys: ['pc ', 'plano', 'patt 23', 'patt23', 'patt123'],        id: 'PcSpot' },
    { keys: ['profile', 'ellipsoidal', 'cantata', 'acclaim'],        id: 'Profile' },
    { keys: ['followspot', 'follow spot', 'follow-spot', 'spot fol'], id: 'Followspot' },
    { keys: ['scoop'],                                                id: 'Scoop' },
    { keys: ['cyc', 'ground row', 'cyclorama'],                      id: 'CycLight' },
    { keys: ['moving head', 'movinghead', 'scanner', 'intelligen'],  id: 'MovingHead' },
    { keys: ['moving wash', 'movingwash', 'led wash', 'wash'],       id: 'MovingWash' },
    { keys: ['blinder'],                                              id: 'Blinder' },
    { keys: ['haze', 'fog', 'smoke', 'cracker'],                     id: 'Hazer' },
    { keys: ['led bar', 'pixel bar', 'batten'],                      id: 'LedBar' },
    { keys: ['strip', 'groundrow'],                                   id: 'Strip' },
    { keys: ['beam', 'acl', 'pinspot'],                              id: 'Beam' },
    { keys: ['flood', 'blinder', 'asymmetric'],                      id: 'Flood' },
    { keys: ['par'],                                                  id: 'Par64' },
  ];
  for (const { keys, id } of keywordMap) {
    if (keys.some(k => lc.includes(k))) {
      const entry = SYMBOL_CATALOGUE.find(s => s.id === id);
      if (entry) return entry;
    }
  }
  return DEFAULT_SYMBOL;
}

// ── Power extraction helpers ───────────────────────────────────────────────────

function extractPower(ft, doc) {
  // 1. Direct attribute on FixtureType (GDTF 1.2+)
  for (const attr of ['PowerConsumption', 'PowerConsumptionMax', 'MaxPower', 'Power']) {
    const v = parseFloat(ft.getAttribute(attr));
    if (v > 0) return v;
  }
  // 2. PhysicalDescriptions/Properties/OperatingTemperature-style property nodes
  //    Some exporters use <Property Name="PowerConsumption" Value="650"/>
  const propNodes = doc.querySelectorAll('Properties Property, PhysicalDescriptions Property');
  for (const p of propNodes) {
    const pname = (p.getAttribute('Name') || '').toLowerCase();
    if (pname.includes('power')) {
      const v = parseFloat(p.getAttribute('Value') || p.textContent);
      if (v > 0) return v;
    }
  }
  // 3. <OperatingTemperature> sibling — not power, skip
  return undefined;
}

function extractWeight(ft, doc) {
  // 1. FixtureType/@Weight (GDTF standard)
  const v = parseFloat(ft.getAttribute('Weight'));
  if (v > 0) return v;
  // 2. Property node
  const propNodes = doc.querySelectorAll('Properties Property, PhysicalDescriptions Property');
  for (const p of propNodes) {
    const pname = (p.getAttribute('Name') || '').toLowerCase();
    if (pname.includes('weight')) {
      const w = parseFloat(p.getAttribute('Value') || p.textContent);
      if (w > 0) return w;
    }
  }
  return undefined;
}

// ── Main parser ────────────────────────────────────────────────────────────────

export async function parseGdtf(fileBuffer, fileName) {
  const zip = await JSZip.loadAsync(fileBuffer);

  const descFile = zip.file('description.xml');
  if (!descFile) throw new Error('Not a valid GDTF: missing description.xml');

  const xml = await descFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const ft = doc.querySelector('FixtureType');
  if (!ft) throw new Error('No FixtureType element found in GDTF');

  const name         = ft.getAttribute('Name')         || fileName.replace(/\.gdtf$/i, '');
  const manufacturer = ft.getAttribute('Manufacturer') || 'Unknown';
  const shortName    = ft.getAttribute('ShortName')    || name;
  const category     = ft.getAttribute('Type')         || '';

  const modes = [];
  doc.querySelectorAll('DMXMode').forEach(mode => {
    const modeName = mode.getAttribute('Name') || 'Mode 1';
    const channels = mode.querySelectorAll('DMXChannel');
    modes.push({ name: modeName, channelCount: channels.length });
  });
  if (modes.length === 0) modes.push({ name: 'Default', channelCount: 1 });

  const sym    = symbolForCategory(category);
  const powerW = extractPower(ft, doc);
  const weight = extractWeight(ft, doc);

  const result = {
    id: generateId(),
    name: `${manufacturer} ${name}`,
    shortName,
    manufacturer,
    category: 'GDTF',
    gdtfCategory: category,
    source: 'gdtf',
    modes,
    defaultMode: modes[0].name,
    defaultChannelCount: modes[0].channelCount,
    symbol: sym.symbol,
    symbolViewBox: sym.symbolViewBox,
    symbolId: sym.id,
    defaultFields: { colour: 'Open', gobo: '' },
  };
  if (powerW !== undefined) result.powerW  = powerW;
  if (weight !== undefined) result.weightKg = weight;
  return result;
}
