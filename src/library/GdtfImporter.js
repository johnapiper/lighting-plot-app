import JSZip from 'jszip';
import { generateId } from '../canvas/geometry';

// ── Symbol catalogue ─ exported so other components can offer a picker ─────────
export const SYMBOL_CATALOGUE = [
  {
    id: 'MovingHead',
    label: 'Moving Head',
    symbol: "<circle cx='0' cy='0' r='12' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-18' y1='0' x2='-12' y2='0' stroke='currentColor' stroke-width='2'/><line x1='12' y1='0' x2='18' y2='0' stroke='currentColor' stroke-width='2'/><circle cx='-18' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='18' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-12' x2='0' y2='-20' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-24 -22 48 44',
  },
  {
    id: 'Spot',
    label: 'Spot / PC',
    symbol: "<ellipse cx='0' cy='0' rx='10' ry='15' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-10' y1='10' x2='10' y2='10' stroke='currentColor' stroke-width='1.5'/><line x1='-7' y1='13' x2='-7' y2='17' stroke='currentColor' stroke-width='1.5'/><line x1='7' y1='13' x2='7' y2='17' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-15' x2='0' y2='-21' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -23 40 50',
  },
  {
    id: 'Profile',
    label: 'Profile / ERS',
    symbol: "<ellipse cx='0' cy='0' rx='10' ry='15' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-10' y1='10' x2='10' y2='10' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-15' x2='0' y2='-21' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -23 40 46',
  },
  {
    id: 'Fresnel',
    label: 'Fresnel',
    symbol: "<circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-14' y1='6' x2='14' y2='6' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-14' x2='0' y2='-20' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  {
    id: 'Wash',
    label: 'Wash / LED Par',
    symbol: "<circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='-5' cy='-5' r='2' fill='currentColor'/><circle cx='5' cy='-5' r='2' fill='currentColor'/><circle cx='-5' cy='5' r='2' fill='currentColor'/><circle cx='5' cy='5' r='2' fill='currentColor'/><circle cx='0' cy='0' r='2' fill='currentColor'/><line x1='0' y1='-14' x2='0' y2='-20' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  {
    id: 'Beam',
    label: 'Beam / ACL',
    symbol: "<circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='6' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-14' x2='0' y2='-20' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  {
    id: 'Flood',
    label: 'Flood / Blinder',
    symbol: "<rect x='-14' y='-10' width='28' height='20' rx='2' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-10' x2='0' y2='-18' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  {
    id: 'Strip',
    label: 'Strip / Batten',
    symbol: "<rect x='-22' y='-6' width='44' height='12' rx='2' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='-14' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/><circle cx='0' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/><circle cx='14' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1'/><line x1='0' y1='-6' x2='0' y2='-14' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-26 -18 52 36',
  },
  {
    id: 'Generic',
    label: 'Generic',
    symbol: "<circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-14' x2='0' y2='-20' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -22 40 44',
  },
];

const DEFAULT_SYMBOL = SYMBOL_CATALOGUE.find(s => s.id === 'Generic');

function symbolForCategory(category = '') {
  const lc = category.toLowerCase();
  // Fuzzy match against catalogue labels and ids
  const entry = SYMBOL_CATALOGUE.find(s =>
    lc.includes(s.id.toLowerCase()) || s.id.toLowerCase().includes(lc.split(/[\s,]/)[0])
  );
  return entry || DEFAULT_SYMBOL;
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
