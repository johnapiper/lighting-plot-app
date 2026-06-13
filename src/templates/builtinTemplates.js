// Built-in project templates with full generated content (fixtures, pipes/trusses,
// infrastructure and a drawn background venue). Coordinate model: 1 world unit = 1 mm.
import { makeDrawing, makeSheet, DEFAULT_LAYERS } from '../store/projectStore';

let _n = 0;
const uid = (p) => p + '_' + (++_n) + '_' + Math.random().toString(36).slice(2, 7);

const ARCH = 'layer-arch';
const LIGHT = 'layer-lighting';

const FIXTURE_DISPLAY = {
  fresnel: 'Fresnel',
  profile: 'Profile',
  par: 'PAR Can',
  flood: 'Flood',
  ledwash: 'LED Wash',
  movinghead: 'Moving Head',
};

// ── Builder helpers ─────────────────────────────────────────────────────────

function line(x1, y1, x2, y2) {
  return { id: uid('line'), kind: 'line', x1, y1, x2, y2, layerId: ARCH };
}
function rect(x, y, w, h) {
  return { id: uid('rect'), kind: 'rect', x, y, w, h, layerId: ARCH };
}
function text(x, y, label, fontSize = 300) {
  return { id: uid('txt'), kind: 'text', x, y, label, fontSize, layerId: ARCH };
}
function pipe(x1, y, x2, name, height = '5.5', isTruss = false) {
  const p = { id: uid('pipe'), kind: 'pipe', x1, y1: y, x2, y2: y, name, height, layerId: LIGHT };
  if (isTruss) p.type = 'truss';
  return p;
}
function pdu(x, y, label, count) {
  const circuits = [];
  for (let i = 1; i <= count; i++) circuits.push({ id: uid('cct'), label: 'Cct ' + i, rating: '16A' });
  return { id: uid('infra'), type: 'distro', kind: 'infra', x, y, label, onStructureId: null, layerId: LIGHT, circuits };
}
function node(x, y, label, universeStart = 1, universeCount = 4) {
  return { id: uid('infra'), type: 'node', kind: 'infra', x, y, label, onStructureId: null, layerId: LIGHT, universeStart, universeCount };
}

// Rolling DMX / channel / unit counter shared across a rig build.
function makeCounter() {
  let channel = 0;
  let universe = 1;
  let uniChan = 0;
  let unit = 0;
  return {
    next() {
      channel++; unit++; uniChan++;
      if (uniChan > 512) { universe++; uniChan = 1; }
      return {
        channel: String(channel),
        dmxAddress: universe + '/' + uniChan,
        unit: String(unit),
      };
    },
  };
}

// Place `count` fixtures evenly along a pipe span.
function fixturesOnPipe(p, fixtureTypeId, count, purpose, counter, opts = {}) {
  const out = [];
  const x1 = p.x1, x2 = p.x2, y = p.y1;
  const span = x2 - x1;
  for (let i = 0; i < count; i++) {
    // Evenly spaced with inset from the ends.
    const t = count === 1 ? 0.5 : (i + 0.5) / count;
    const x = Math.round(x1 + span * t);
    const c = counter.next();
    out.push({
      id: uid('fix'),
      kind: 'fixture',
      fixtureTypeId,
      type: FIXTURE_DISPLAY[fixtureTypeId],
      x, y,
      pipeId: p.id,
      position: p.name,
      unit: c.unit,
      channel: c.channel,
      dmxAddress: c.dmxAddress,
      dmxMode: '',
      dmxChannelCount: 1,
      colour: 'Open',
      colourHex: null,
      gobo: '',
      purpose,
      rotation: opts.rotation || 0,
      scale: 1,
      layerId: LIGHT,
    });
  }
  return out;
}

function buildProject(drawing, meta) {
  return {
    drawings: [drawing],
    activeDrawingId: drawing.id,
    sheets: [makeSheet('sheet-1', 'Sheet 1')],
    activeSheetId: 'sheet-1',
    activeMode: 'cad',
    activeLayerId: LIGHT,
    customFixtureTypes: [],
    layers: DEFAULT_LAYERS,
    meta,
    revisions: [],
  };
}

// ── 1. Blank ────────────────────────────────────────────────────────────────

function buildBlank() {
  const d = makeDrawing('drawing-1', 'Plot 1');
  d.calibration = null;
  return buildProject(d, { title: 'Untitled', scale: 50, gridSize: 1372, gridHeight: 6000, rigHeight: 5500, units: 'mm' });
}

// ── 2. Theatre (Proscenium) ──────────────────────────────────────────────────

function buildTheatre() {
  const d = makeDrawing('drawing-1', 'Theatre Plot');
  d.calibration = null;
  const cx = 6000;            // centre line x
  const procHalf = 5000;      // proscenium opening 10000 wide
  const stageHalf = 6000;     // stage 12000 wide
  const settingY = 2000;      // setting line (downstage edge of stage proper)
  const cycY = 11000;         // cyclorama upstage
  const fohY = 0;             // FOH bar downstage of proscenium

  // Background venue
  d.lines.push(
    // proscenium opening (the wall, with a gap for the opening)
    line(cx - stageHalf, settingY, cx - procHalf, settingY),
    line(cx + procHalf, settingY, cx + stageHalf, settingY),
    // side walls of stage house
    line(cx - stageHalf, settingY, cx - stageHalf, cycY + 500),
    line(cx + stageHalf, settingY, cx + stageHalf, cycY + 500),
    // back wall / cyc line
    line(cx - stageHalf, cycY, cx + stageHalf, cycY),
    // centre line
    line(cx, settingY, cx, cycY),
    // apron curve (approximated downstage of the setting line)
    line(cx - procHalf, settingY, cx - procHalf + 600, settingY - 700),
    line(cx - procHalf + 600, settingY - 700, cx + procHalf - 600, settingY - 700),
    line(cx + procHalf - 600, settingY - 700, cx + procHalf, settingY),
    // FOH position line (auditorium edge)
    line(cx - stageHalf, fohY - 1000, cx + stageHalf, fohY - 1000),
  );
  d.rectangles.push(
    // proscenium reveal blocks
    rect(cx - stageHalf, settingY - 200, 1000, 200),
    rect(cx + stageHalf - 1000, settingY - 200, 1000, 200),
  );
  d.texts.push(
    text(cx - 600, 6500, 'STAGE', 500),
    text(cx - 400, fohY - 1500, 'FOH', 400),
    text(cx - 500, cycY + 800, 'CYC', 400),
  );

  // Pipes
  const foh = pipe(cx - procHalf - 500, fohY, cx + procHalf + 500, 'FOH Bar', '6.5');
  const lx1 = pipe(cx - stageHalf + 500, 3500, cx + stageHalf - 500, 'LX1', '7.0');
  const lx2 = pipe(cx - stageHalf + 500, 6000, cx + stageHalf - 500, 'LX2', '7.0');
  const lx3 = pipe(cx - stageHalf + 500, 8500, cx + stageHalf - 500, 'LX3', '7.0');
  const cyc = pipe(cx - stageHalf + 500, 10500, cx + stageHalf - 500, 'Cyc Bar', '7.0');
  d.pipes.push(foh, lx1, lx2, lx3, cyc);

  // Fixtures
  const ctr = makeCounter();
  d.fixtures.push(
    ...fixturesOnPipe(foh, 'profile', 6, 'Front wash', ctr),
    ...fixturesOnPipe(lx1, 'fresnel', 5, 'Top wash', ctr),
    ...fixturesOnPipe(lx2, 'fresnel', 5, 'Top wash', ctr),
    ...fixturesOnPipe(lx3, 'par', 4, 'Back light', ctr),
    ...fixturesOnPipe(cyc, 'flood', 4, 'Cyc wash', ctr),
  );

  // Infrastructure
  d.infrastructure.push(
    pdu(cx + stageHalf + 1200, 6000, 'PDU 1', 6),
    node(cx + stageHalf + 1200, 8000, 'Node 1', 1, 4),
  );

  return buildProject(d, { title: 'Theatre Plot', scale: 50, gridSize: 500, gridHeight: 8000, rigHeight: 7000, units: 'mm' });
}

// ── 3. Concert / Live Event ──────────────────────────────────────────────────

function buildConcert() {
  const d = makeDrawing('drawing-1', 'Concert Rig');
  d.calibration = null;
  const cx = 8000;
  const stageHalf = 8000;     // stage 16000 wide
  const dsY = 1000;           // downstage edge
  const usY = 9000;           // upstage

  // Background
  d.rectangles.push(
    // stage deck
    rect(cx - stageHalf, dsY, stageHalf * 2, usY - dsY),
  );
  d.lines.push(
    // downstage edge (thrust)
    line(cx - stageHalf, dsY, cx + stageHalf, dsY),
    // wing lines
    line(cx - stageHalf, dsY, cx - stageHalf, usY),
    line(cx + stageHalf, dsY, cx + stageHalf, usY),
    // centre line
    line(cx, dsY, cx, usY),
    // FOH / mix position (downstage of deck)
    line(cx - 2000, dsY - 6000, cx + 2000, dsY - 6000),
    line(cx - 2000, dsY - 6000, cx - 2000, dsY - 5000),
    line(cx + 2000, dsY - 6000, cx + 2000, dsY - 5000),
  );
  d.texts.push(
    text(cx - 700, 5000, 'STAGE', 600),
    text(cx - 1200, dsY - 5500, 'FOH MIX', 500),
  );

  // Trusses
  const front = pipe(cx - stageHalf + 1000, dsY + 1000, cx + stageHalf - 1000, 'Front Truss', '11.0', true);
  const mid   = pipe(cx - stageHalf + 1000, dsY + 4000, cx + stageHalf - 1000, 'Mid Truss', '11.0', true);
  const back  = pipe(cx - stageHalf + 1000, dsY + 7000, cx + stageHalf - 1000, 'Back Truss', '11.0', true);
  const sl    = pipe(cx - stageHalf + 500, dsY + 2000, cx - stageHalf + 500, 'SL Wing Truss', '9.0', true);
  const sr    = pipe(cx + stageHalf - 500, dsY + 2000, cx + stageHalf - 500, 'SR Wing Truss', '9.0', true);
  // Give wing trusses a vertical span so fixtures distribute along them.
  sl.y2 = dsY + 6000; sr.y2 = dsY + 6000; sl.x2 = sl.x1; sr.x2 = sr.x1;
  d.pipes.push(front, mid, back, sl, sr);

  const ctr = makeCounter();
  d.fixtures.push(
    ...fixturesOnPipe(front, 'movinghead', 7, 'Front movers', ctr),
    ...fixturesOnPipe(mid, 'ledwash', 7, 'Wash', ctr),
    ...fixturesOnPipe(back, 'movinghead', 7, 'Back movers', ctr),
    ...fixturesOnPipe(sl, 'par', 4, 'SL blinders', ctr),
    ...fixturesOnPipe(sr, 'par', 4, 'SR blinders', ctr),
  );

  d.infrastructure.push(
    pdu(cx - stageHalf - 1500, dsY + 2000, 'PDU 1', 8),
    pdu(cx + stageHalf + 1500, dsY + 2000, 'PDU 2', 8),
    node(cx - stageHalf - 1500, dsY + 4000, 'Node 1', 1, 4),
    node(cx + stageHalf + 1500, dsY + 4000, 'Node 2', 5, 4),
  );

  return buildProject(d, { title: 'Concert Rig', scale: 100, gridSize: 1000, gridHeight: 12000, rigHeight: 11000, units: 'mm' });
}

// ── 4. TV Studio ─────────────────────────────────────────────────────────────

function buildTvStudio() {
  const d = makeDrawing('drawing-1', 'TV Studio');
  d.calibration = null;
  const x0 = 1000, y0 = 1000;
  const w = 14000, h = 11000;
  const cx = x0 + w / 2;

  // Background
  d.rectangles.push(
    // studio walls
    rect(x0, y0, w, h),
  );
  d.lines.push(
    // cyc curve along the far (upstage) wall
    line(x0 + 1000, y0 + h - 1200, x0 + 1600, y0 + h - 1800),
    line(x0 + 1600, y0 + h - 1800, x0 + w - 1600, y0 + h - 1800),
    line(x0 + w - 1600, y0 + h - 1800, x0 + w - 1000, y0 + h - 1200),
    // door / control room gap on the near wall
    line(x0, y0, x0 + 4000, y0),
    line(x0 + 6000, y0, x0 + w, y0),
    // set area marker
    line(x0 + 3000, y0 + 3000, x0 + w - 3000, y0 + 3000),
  );
  d.texts.push(
    text(cx - 1300, y0 + 5500, 'STUDIO FLOOR', 500),
    text(cx - 400, y0 + h - 2400, 'CYC', 400),
    text(x0 + 4200, y0 + 300, 'CONTROL', 350),
  );

  // Ceiling grid: 5 bars running across (horizontal), evenly spaced upstage.
  const bars = [];
  const nBars = 5;
  const gx1 = x0 + 1500, gx2 = x0 + w - 1500;
  for (let i = 0; i < nBars; i++) {
    const gy = y0 + 1800 + (i * (h - 3600)) / (nBars - 1);
    bars.push(pipe(gx1, Math.round(gy), gx2, 'Grid Bar ' + (i + 1), '4.5'));
  }
  d.pipes.push(...bars);

  const ctr = makeCounter();
  // Soft studio light: Fresnels & Floods, profiles, LED wash on the cyc-facing bar.
  d.fixtures.push(
    ...fixturesOnPipe(bars[0], 'fresnel', 5, 'Key light', ctr),
    ...fixturesOnPipe(bars[1], 'flood', 5, 'Fill light', ctr),
    ...fixturesOnPipe(bars[2], 'fresnel', 5, 'Back light', ctr),
    ...fixturesOnPipe(bars[3], 'profile', 5, 'Specials', ctr),
    ...fixturesOnPipe(bars[4], 'ledwash', 5, 'Cyc wash', ctr),
  );

  d.infrastructure.push(
    pdu(x0 + w + 1200, y0 + h / 2, 'PDU 1', 12),
    node(x0 + w + 1200, y0 + h / 2 + 2000, 'Node 1', 1, 4),
  );

  return buildProject(d, { title: 'TV Studio', scale: 50, gridSize: 500, gridHeight: 5000, rigHeight: 4000, units: 'mm' });
}

// ── 5. Corporate / Conference ────────────────────────────────────────────────

function buildCorporate() {
  const d = makeDrawing('drawing-1', 'Corporate Event');
  d.calibration = null;
  const cx = 5000;
  const stageHalf = 4000;     // stage 8000 wide
  const dsY = 1000, usY = 5000;

  d.rectangles.push(
    rect(cx - stageHalf, dsY, stageHalf * 2, usY - dsY),
  );
  d.lines.push(
    line(cx - stageHalf, dsY, cx + stageHalf, dsY),
    line(cx, dsY, cx, usY),
    // screen / backdrop line upstage
    line(cx - stageHalf + 500, usY - 300, cx + stageHalf - 500, usY - 300),
  );
  d.texts.push(
    text(cx - 600, 3000, 'STAGE', 450),
    text(cx - 900, usY - 800, 'SCREEN', 350),
  );

  const front = pipe(cx - stageHalf + 800, dsY + 1000, cx + stageHalf - 800, 'Front Truss', '3.5', true);
  const back  = pipe(cx - stageHalf + 800, dsY + 3000, cx + stageHalf - 800, 'Back Truss', '3.5', true);
  d.pipes.push(front, back);

  const ctr = makeCounter();
  d.fixtures.push(
    ...fixturesOnPipe(front, 'ledwash', 4, 'Stage wash', ctr),
    ...fixturesOnPipe(back, 'movinghead', 4, 'Effects', ctr),
  );

  d.infrastructure.push(
    pdu(cx + stageHalf + 1200, dsY + 2000, 'PDU 1', 6),
  );

  return buildProject(d, { title: 'Corporate Event', scale: 25, gridSize: 250, gridHeight: 4000, rigHeight: 3500, units: 'mm' });
}

// ── Export ────────────────────────────────────────────────────────────────

export const BUILT_IN_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Project',
    description: 'Start from scratch with default layers.',
    icon: '📄',
    meta: { title: 'Untitled', scale: 50, gridSize: 1372, gridHeight: 6000, rigHeight: 5500, units: 'mm' },
    buildSnapshot: buildBlank,
  },
  {
    id: 'theatre',
    name: 'Theatre (Proscenium)',
    description: 'Standard proscenium theatre setup — FOH, flies, cyc, side positions.',
    icon: '🎭',
    meta: { title: 'Theatre Plot', scale: 50, gridSize: 500, gridHeight: 8000, rigHeight: 7000, units: 'mm' },
    buildSnapshot: buildTheatre,
  },
  {
    id: 'concert',
    name: 'Concert / Live Event',
    description: 'Large grid for touring & concert rigs with truss positions.',
    icon: '🎵',
    meta: { title: 'Concert Rig', scale: 100, gridSize: 1000, gridHeight: 12000, rigHeight: 11000, units: 'mm' },
    buildSnapshot: buildConcert,
  },
  {
    id: 'tv-studio',
    name: 'TV Studio',
    description: 'TV studio ceiling grid with practical working heights.',
    icon: '📺',
    meta: { title: 'TV Studio', scale: 50, gridSize: 500, gridHeight: 5000, rigHeight: 4000, units: 'mm' },
    buildSnapshot: buildTvStudio,
  },
  {
    id: 'corporate',
    name: 'Corporate / Conference',
    description: 'Smaller-scale event space or conference room.',
    icon: '🏢',
    meta: { title: 'Corporate Event', scale: 25, gridSize: 250, gridHeight: 4000, rigHeight: 3500, units: 'mm' },
    buildSnapshot: buildCorporate,
  },
];
