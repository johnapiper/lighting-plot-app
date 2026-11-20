import JSZip from 'jszip';
import { generateId } from '../canvas/geometry';

import { SYMBOL_CATALOGUE } from './symbols';
export { SYMBOL_CATALOGUE };

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
    { keys: ['fresnel'],                                              id: 'FresnelBD' },
    { keys: ['pc ', 'plano', 'patt 23', 'patt23', 'patt123'],        id: 'PcBD' },
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
