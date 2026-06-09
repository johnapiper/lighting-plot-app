/**
 * MVR Import — reads an MVR ZIP archive and returns a Lighting Plot project.
 *
 * Strategy:
 *   1. If LightingPlot.json is present → return it as-is (full fidelity round-trip)
 *   2. Otherwise parse GeneralSceneDescription.xml → build a minimal project from
 *      the fixture and structure data in the MVR.
 */

import JSZip from 'jszip';

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Parse a simple XML attribute value */
function attr(el, name, fallback = '') {
  const m = new RegExp(`${name}="([^"]*)"`, 'i').exec(el);
  return m ? m[1] : fallback;
}

/** Extract text content of a simple tag */
function tagText(xml, tag) {
  const m = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i').exec(xml);
  return m ? m[1].trim() : '';
}

/** MVR metres string → canvas mm number */
function m2mm(s) { return parseFloat(s || '0') * 1000; }

/**
 * Parse MVR Matrix string "u1,v1,w1,x, u2,v2,w2,y, u3,v3,w3,z"
 * Returns { x, y, heightMm, rotDeg } in canvas coordinate system.
 * Convention: MVR X → canvas X, MVR Z → canvas Y, MVR Y → height.
 */
function parseMatrix(matrixStr) {
  const parts = matrixStr.split(',').map(s => parseFloat(s.trim()));
  if (parts.length < 12) return { x: 0, y: 0, heightMm: 0, rotDeg: 0 };
  // Column-major: [u1,v1,w1, u2,v2,w2, u3,v3,w3, tx,ty,tz]
  const tx = parts[9], ty = parts[10], tz = parts[11];
  // u column for rotation around Y: cos(θ) = parts[0], sin(θ) = parts[6]
  const rotDeg = Math.atan2(parts[6], parts[0]) * 180 / Math.PI;
  return {
    x:         m2mm(tx),
    y:         m2mm(tz),    // MVR Z → canvas Y
    heightMm:  m2mm(ty),
    rotDeg,
  };
}

// ── XML parser (no DOM dependency — uses regex on well-formed MVR XML) ───────

function parseFixtureElements(xml) {
  const fixtures = [];
  const re = /<Fixture\b([^>]*)>([\s\S]*?)<\/Fixture>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const body  = m[2];
    const name  = attr(attrs, 'name');
    const fUuid = attr(attrs, 'uuid');
    const gdtfSpec  = attr(attrs, 'gdtf_spec');
    const gdtfMode  = attr(attrs, 'gdtf_mode');
    const matrixStr = tagText(body, 'Matrix');
    const addrStr   = tagText(body, 'Address');
    const unit      = tagText(body, 'UnitNumber');
    const channel   = tagText(body, 'FixtureID');
    const colour    = tagText(body, 'Color');
    const customId  = tagText(body, 'CustomId');

    const { x, y, rotDeg } = parseMatrix(matrixStr);

    // Derive fixtureTypeId from gdtf_spec filename (strip path + extension)
    const gdtfBase = gdtfSpec.replace(/.*[\\/]/, '').replace(/\.gdtf$/i, '');

    fixtures.push({
      id:              customId || generateId(),
      mvrUuid:         fUuid,
      kind:            'fixture',
      fixtureTypeId:   gdtfBase,
      type:            name,
      x, y,
      rotation:        rotDeg,
      unit:            unit || '',
      channel:         channel || '',
      dmxAddress:      addrStr || '',
      dmxMode:         gdtfMode || '',
      colour:          colour || 'Open',
      pipeId:          null,
      position:        '',
      scale:           1,
    });
  }
  return fixtures;
}

function parseSceneObjectElements(xml) {
  const pipes = [];
  const re = /<SceneObject\b([^>]*)>([\s\S]*?)<\/SceneObject>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1];
    const body  = m[2];
    const name      = attr(attrs, 'name');
    const objUuid   = attr(attrs, 'uuid');
    const matrixStr = tagText(body, 'Matrix');
    const classing  = tagText(body, 'Classing').toLowerCase();
    const lengthM   = parseFloat(tagText(body, 'Length') || '3');
    const customId  = tagText(body, 'CustomId');

    const { x, y, rotDeg } = parseMatrix(matrixStr);
    const halfLen = (lengthM * 1000) / 2;
    const θ = (rotDeg * Math.PI) / 180;

    pipes.push({
      id:       customId || generateId(),
      mvrUuid:  objUuid,
      kind:     'pipe',
      type:     classing === 'truss' ? 'truss' : 'pipe',
      name:     name || (classing === 'truss' ? 'Truss' : 'Pipe'),
      x1:       x - Math.cos(θ) * halfLen,
      y1:       y - Math.sin(θ) * halfLen,
      x2:       x + Math.cos(θ) * halfLen,
      y2:       y + Math.sin(θ) * halfLen,
    });
  }
  return pipes;
}

function parseMVRXml(xml) {
  const fixtures = parseFixtureElements(xml);
  const pipes    = parseSceneObjectElements(xml);
  return { fixtures, pipes };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Import a .mvr file (Uint8Array or ArrayBuffer) and return a project object.
 *
 * If the MVR was produced by this app it will contain a LightingPlot.json
 * with the complete project — that is returned as-is.
 * Otherwise the MVR XML is parsed and a minimal project is synthesised.
 */
export async function importMVR(buffer) {
  const zip = await JSZip.loadAsync(buffer);

  // Prefer the full extended project if present
  const extFile = zip.file('LightingPlot.json');
  if (extFile) {
    const json = await extFile.async('string');
    return JSON.parse(json);
  }

  // Fall back: parse the MVR XML
  const xmlFile = zip.file('GeneralSceneDescription.xml');
  if (!xmlFile) throw new Error('Not a valid MVR file (missing GeneralSceneDescription.xml).');

  const xml = await xmlFile.async('string');
  const { fixtures, pipes } = parseMVRXml(xml);

  const drawingId = generateId();
  return {
    meta: { gridHeight: 6000, rigHeight: 5500 },
    activeDrawingId: drawingId,
    activeMode: 'cad',
    drawings: [{
      id:             drawingId,
      name:           'Imported from MVR',
      fixtures,
      pipes,
      lines:          [],
      rectangles:     [],
      texts:          [],
      images:         [],
      annotations:    [],
      infrastructure: [],
      cables:         [],
    }],
    sheets:             [],
    customFixtureTypes: [],
    layers: [
      { id: 'layer-bg',       name: 'Background', visible: true, locked: false, color: '#4a90d9' },
      { id: 'layer-arch',     name: 'Architecture', visible: true, locked: false, color: '#90a0b0' },
      { id: 'layer-lighting', name: 'Lighting',   visible: true, locked: false, color: '#ffd032' },
    ],
    activeLayerId: 'layer-lighting',
  };
}
