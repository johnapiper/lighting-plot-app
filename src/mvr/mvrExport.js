/**
 * MVR Export — converts a Lighting Plot project to an MVR (My Virtual Rig) archive.
 *
 * MVR is an open standard ZIP file containing:
 *   GeneralSceneDescription.xml  — fixtures, structures, scene graph
 *   LightingPlot.json            — extended data not storable in MVR
 *                                   (cables, sheets, annotations, custom types…)
 *
 * MVR spec: https://gdtf-share.com/mvr
 * Coordinates: MVR uses metres; canvas uses mm.  X → X, Y (canvas) → Z in MVR, Y=0.
 */

import JSZip from 'jszip';

// ── Helpers ──────────────────────────────────────────────────────────────────

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }).toUpperCase();
}

/** World mm → MVR metres string, 4 dp */
function mm2m(mm) { return (mm / 1000).toFixed(4); }

/**
 * Build a 4×3 MVR matrix string for a 2-D position + Y-axis rotation.
 * Convention: canvas X → MVR X, canvas Y → MVR Z, MVR Y = height.
 *   rotation in degrees around MVR Y axis (vertical).
 */
function mvrMatrix(xMm, yMm, heightMm, rotDeg) {
  const θ = ((rotDeg || 0) * Math.PI) / 180;
  const cos = Math.cos(θ), sin = Math.sin(θ);
  // Column-major 4×3: u=(cos,0,-sin), v=(0,1,0), w=(sin,0,cos), pos=(x,h,z)
  return [
    cos.toFixed(6), 0, (-sin).toFixed(6),              // u
    0, 1, 0,                                            // v
    sin.toFixed(6), 0, cos.toFixed(6),                  // w
    mm2m(xMm), mm2m(heightMm || 0), mm2m(yMm),         // position
  ].join(',');
}

function escXml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── XML builder ──────────────────────────────────────────────────────────────

function buildFixtureXml(fixture, fixtureTypes, rigHeightMm) {
  const ftype = fixtureTypes.find(t => t.id === fixture.fixtureTypeId) || {};
  const gdtfSpec = ftype.gdtfSpec || `${escXml(ftype.manufacturer || 'Generic')}@${escXml(ftype.name || fixture.type || 'Fixture')}.gdtf`;
  const gdtfMode = escXml(fixture.dmxMode || ftype.defaultMode || '');
  const fixUuid = fixture.mvrUuid || uuid4();

  const heightMm = fixture.pipeId || fixture.onStructureId ? rigHeightMm : 0;

  let dmxAddr = '';
  if (fixture.dmxAddress) {
    dmxAddr = `\n        <Addresses><Address break="0">${escXml(fixture.dmxAddress)}</Address></Addresses>`;
  }

  return `      <Fixture name="${escXml(fixture.type || ftype.name || 'Fixture')}" uuid="${fixUuid}" gdtf_spec="${gdtfSpec}" gdtf_mode="${gdtfMode}">
        <Matrix>${mvrMatrix(fixture.x, fixture.y, heightMm, fixture.rotation)}</Matrix>${dmxAddr}
        <UnitNumber>${escXml(fixture.unit || '')}</UnitNumber>
        <FixtureID>${escXml(fixture.channel || '')}</FixtureID>
        <Color>${escXml(fixture.colour || '')}</Color>
        <CustomId>${escXml(fixture.id)}</CustomId>
      </Fixture>`;
}

function buildPipeXml(pipe) {
  const pipeUuid = pipe.mvrUuid || uuid4();
  // Represent as a SceneObject at the midpoint of the pipe
  const mx = (pipe.x1 + pipe.x2) / 2;
  const my = (pipe.y1 + pipe.y2) / 2;
  const lenMm = Math.sqrt((pipe.x2 - pipe.x1) ** 2 + (pipe.y2 - pipe.y1) ** 2);
  const angleDeg = Math.atan2(pipe.y2 - pipe.y1, pipe.x2 - pipe.x1) * 180 / Math.PI;

  return `      <SceneObject name="${escXml(pipe.name || (pipe.type === 'truss' ? 'Truss' : 'Pipe'))}" uuid="${pipeUuid}">
        <Matrix>${mvrMatrix(mx, my, 0, angleDeg)}</Matrix>
        <Classing>${escXml(pipe.type === 'truss' ? 'Truss' : 'Pipe')}</Classing>
        <CustomId>${escXml(pipe.id)}</CustomId>
        <Length>${mm2m(lenMm)}</Length>
      </SceneObject>`;
}

function buildLayerXml(name, layerUuid, children) {
  return `    <Layer name="${escXml(name)}" uuid="${layerUuid}">
      <ChildList>
${children.join('\n')}
      </ChildList>
    </Layer>`;
}

function buildSceneXml(drawing, fixtureTypes, rigHeightMm) {
  const fixtures   = drawing.fixtures   || [];
  const pipes      = drawing.pipes      || [];

  const fixXmls  = fixtures.map(f => buildFixtureXml(f, fixtureTypes, rigHeightMm));
  const pipeXmls = pipes.map(p => buildPipeXml(p));

  const fixtureLayer   = buildLayerXml('Fixtures',   uuid4(), fixXmls);
  const structureLayer = buildLayerXml('Structures', uuid4(), pipeXmls);

  return `<?xml version="1.0" encoding="UTF-8"?>
<GeneralSceneDescription verMinor="0" verMajor="1">
  <UserData>
    <Data provider="LightingPlotApp" ver="2">
      <ExtendedData>LightingPlot.json</ExtendedData>
    </Data>
  </UserData>
  <Scene>
    <Layers>
${fixtureLayer}
${structureLayer}
    </Layers>
  </Scene>
</GeneralSceneDescription>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Export project to MVR zip as a Uint8Array.
 * The ZIP contains:
 *   GeneralSceneDescription.xml  — MVR scene (fixtures + structures)
 *   LightingPlot.json            — full extended project data
 */
export async function exportMVR(project, fixtureTypes) {
  const activeDrawing = (project.drawings || []).find(d => d.id === project.activeDrawingId)
    || (project.drawings || [])[0];

  if (!activeDrawing) throw new Error('No active drawing to export.');

  const rigHeightMm = project.meta?.rigHeight ?? 5500;

  const xml = buildSceneXml(activeDrawing, fixtureTypes, rigHeightMm);

  const zip = new JSZip();
  zip.file('GeneralSceneDescription.xml', xml);
  // Store the FULL project as extended data (minus images which are large)
  const extProject = { ...project };
  zip.file('LightingPlot.json', JSON.stringify(extProject, null, 2));

  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/**
 * Return JUST the GeneralSceneDescription.xml for inspection/debugging.
 */
export function exportMVRXml(project, fixtureTypes) {
  const activeDrawing = (project.drawings || []).find(d => d.id === project.activeDrawingId)
    || (project.drawings || [])[0];
  const rigHeightMm = project.meta?.rigHeight ?? 5500;
  return buildSceneXml(activeDrawing || { fixtures: [], pipes: [] }, fixtureTypes, rigHeightMm);
}
