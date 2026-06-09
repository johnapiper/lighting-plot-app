import JSZip from 'jszip';
import { generateId } from '../canvas/geometry';

// Map GDTF fixture categories to our SVG symbols
const CATEGORY_SYMBOLS = {
  MovingHead: {
    symbol: "<circle cx='0' cy='0' r='12' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-18' y1='0' x2='-12' y2='0' stroke='currentColor' stroke-width='2'/><line x1='12' y1='0' x2='18' y2='0' stroke='currentColor' stroke-width='2'/><circle cx='-18' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='18' cy='0' r='3' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-12' x2='0' y2='-20' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-24 -22 48 44',
  },
  Spot: {
    symbol: "<ellipse cx='0' cy='0' rx='10' ry='15' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-10' y1='10' x2='10' y2='10' stroke='currentColor' stroke-width='1.5'/><line x1='-7' y1='13' x2='-7' y2='17' stroke='currentColor' stroke-width='1.5'/><line x1='7' y1='13' x2='7' y2='17' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-15' x2='0' y2='-21' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -23 40 50',
  },
  Wash: {
    symbol: "<circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='-5' cy='-5' r='2' fill='currentColor'/><circle cx='5' cy='-5' r='2' fill='currentColor'/><circle cx='-5' cy='5' r='2' fill='currentColor'/><circle cx='5' cy='5' r='2' fill='currentColor'/><circle cx='0' cy='0' r='2' fill='currentColor'/><line x1='0' y1='-14' x2='0' y2='-20' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  Beam: {
    symbol: "<circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><circle cx='0' cy='0' r='6' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-14' x2='0' y2='-20' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  Fresnel: {
    symbol: "<circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-14' y1='6' x2='14' y2='6' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-14' x2='0' y2='-20' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -22 40 44',
  },
  Profile: {
    symbol: "<ellipse cx='0' cy='0' rx='10' ry='15' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='-10' y1='10' x2='10' y2='10' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-15' x2='0' y2='-21' stroke='currentColor' stroke-width='1.5'/>",
    symbolViewBox: '-20 -23 40 46',
  },
};

const DEFAULT_SYMBOL = {
  symbol: "<circle cx='0' cy='0' r='14' fill='none' stroke='currentColor' stroke-width='1.5'/><line x1='0' y1='-14' x2='0' y2='-20' stroke='currentColor' stroke-width='1.5'/>",
  symbolViewBox: '-20 -22 40 44',
};

function symbolForCategory(category = '') {
  const key = Object.keys(CATEGORY_SYMBOLS).find(k =>
    category.toLowerCase().includes(k.toLowerCase())
  );
  return CATEGORY_SYMBOLS[key] || DEFAULT_SYMBOL;
}

export async function parseGdtf(fileBuffer, fileName) {
  const zip = await JSZip.loadAsync(fileBuffer);

  const descFile = zip.file('description.xml');
  if (!descFile) throw new Error('Not a valid GDTF: missing description.xml');

  const xml = await descFile.async('string');
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');

  const ft = doc.querySelector('FixtureType');
  if (!ft) throw new Error('No FixtureType element found in GDTF');

  const name = ft.getAttribute('Name') || fileName.replace(/\.gdtf$/i, '');
  const manufacturer = ft.getAttribute('Manufacturer') || 'Unknown';
  const shortName = ft.getAttribute('ShortName') || name;
  const category = ft.getAttribute('Type') || '';

  const modes = [];
  doc.querySelectorAll('DMXMode').forEach(mode => {
    const modeName = mode.getAttribute('Name') || 'Mode 1';
    const channels = mode.querySelectorAll('DMXChannel');
    modes.push({ name: modeName, channelCount: channels.length });
  });

  if (modes.length === 0) modes.push({ name: 'Default', channelCount: 1 });

  const sym = symbolForCategory(category);

  return {
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
    defaultFields: { colour: 'Open', gobo: '' },
  };
}
