import React from 'react';

// Per-tool descriptions + which animated demo to show.
export const TOOL_HINTS = {
  select:    { title: 'Select / Move',   demo: 'select',  desc: 'Click an object to select it; drag to move. Ctrl-click adds to the selection, or drag a box to marquee-select.' },
  line:      { title: 'Line',            demo: 'line',    desc: 'Click a start point then an end point. Type a length & angle for precision, or hold Shift for 0/45/90°.' },
  rect:      { title: 'Rectangle',       demo: 'rect',    desc: 'Drag from one corner to the opposite corner to draw a rectangle.' },
  polyline:  { title: 'Polyline',        demo: 'polyline',desc: 'Click to add each vertex; double-click or press Enter to finish, Esc to cancel.' },
  circle:    { title: 'Circle',          demo: 'circle',  desc: 'Click the centre, then click again to set the radius.' },
  arc:       { title: 'Arc',             demo: 'arc',     desc: 'Click the centre, then the start point, then sweep to the end angle.' },
  pipe:      { title: 'Pipe / Bar',      demo: 'bar',     desc: 'Click to place a lighting bar; click again to chain another section. Fixtures snap onto pipes.' },
  truss:     { title: 'Truss',           demo: 'truss',   desc: 'Like Pipe, but drawn as a lattice truss. Click to chain sections; press R to rotate 90°.' },
  text:      { title: 'Text',            demo: 'text',    desc: 'Click to place a text label; double-click any label to edit it.' },
  dimension: { title: 'Measure',         demo: 'measure', desc: 'Click two points to measure the distance. The result stays on screen until you measure again or switch tools.' },
  calibrate: { title: 'Calibrate Scale', demo: 'ruler',   desc: 'Draw a line over a known distance on an imported background, then enter its real size to scale the drawing.' },
  snap:      { title: 'Object Snap',     demo: 'snap',    desc: 'Snaps the cursor to endpoints, midpoints, centres and intersections. Click ▾ to choose which snaps are active. F3 toggles; Ctrl bypasses.' },
  mirror:    { title: 'Mirror',          demo: 'mirror',  desc: 'Creates a mirrored copy of the selection across a vertical or horizontal axis.' },
  array:     { title: 'Array',           demo: 'array',   desc: 'Copies the selection into a rectangular grid or a radial (circular) pattern.' },
  offset:    { title: 'Offset',          demo: 'offset',  desc: 'Makes a parallel copy of lines, circles or polylines at a set distance.' },
  align:     { title: 'Align / Distribute', demo: 'align', desc: 'Aligns the selected objects to a common edge or centre, or spaces them out evenly.' },
  corner:    { title: 'Corner (Trim/Extend)', demo: 'corner', desc: 'Select two lines, then trim or extend them so they meet cleanly at a corner.' },
  group:     { title: 'Group',           demo: 'group',   desc: 'Groups the selected objects so they move and select together (Ctrl+G).' },
  ungroup:   { title: 'Ungroup',         demo: 'group',   desc: 'Splits a group back into individual objects (Ctrl+G).' },
  delete:    { title: 'Delete',          demo: 'delete',  desc: 'Removes the selected objects (Del / Backspace).' },
  zoomin:    { title: 'Zoom In',         demo: 'zoom',    desc: 'Zoom the view in. Scroll the wheel to zoom at the cursor.' },
  zoomout:   { title: 'Zoom Out',        demo: 'zoom',    desc: 'Zoom the view out.' },
  fit:       { title: 'Fit to Window',   demo: 'zoom',    desc: 'Zoom and centre so the whole drawing fits the window (Ctrl+0).' },
  grid:      { title: 'Grid',            demo: 'grid',    desc: 'Show or hide the grid. Grid spacing is set in Studio Settings.' },
  pdf:       { title: 'PDF Background',  demo: 'image',   desc: 'Import a PDF to trace over as a background reference; calibrate it to scale.' },
  image:     { title: 'Place Image',     demo: 'image',   desc: 'Place a raster image (plan, logo, reference) onto the drawing.' },
  patch:     { title: 'DMX Patch',       demo: 'report',  desc: 'Open the DMX patch panel to assign universes, addresses and channels.' },
  fixtures:  { title: 'Fixture Schedule',demo: 'report',  desc: 'Generate the fixture schedule — every unit with its type, position, colour and accessories.' },
  channels:  { title: 'Channel List',    demo: 'report',  desc: 'Generate the channel list — channels with their addresses and purposes.' },
  studio:    { title: 'Studio Settings', demo: 'gear',    desc: 'Set grid size, rig and grid heights, drawing scale and project title.' },
  // Cable mode
  'infra-distro':  { title: 'Power Distro (PDU)', demo: 'place', desc: 'Place a power distribution unit with circuits.' },
  'infra-node':    { title: 'DMX Node',           demo: 'place', desc: 'Place a DMX/Art-Net node with a span of universes.' },
  'infra-switch':  { title: 'Network Switch',     demo: 'place', desc: 'Place a network switch.' },
  'infra-netport': { title: 'Network Port',       demo: 'place', desc: 'Place a network port / floor box.' },
  'cable-power':   { title: 'Power Cable',        demo: 'cable', desc: 'Draw a power cable between fixtures and distros; lengths and loads are calculated.' },
  'cable-dmx':     { title: 'DMX Cable',          demo: 'cable', desc: 'Draw a DMX cable / chain between fixtures and nodes.' },
  'cable-network': { title: 'Network Cable',      demo: 'cable', desc: 'Draw a network cable between devices.' },
  anim:      { title: 'Animate Cables',  demo: 'cable',   desc: 'Toggle animated flow along cables to visualise routing.' },
  report:    { title: 'Cable Report',    demo: 'report',  desc: 'Generate the cable schedule with lengths and circuit loads.' },
  eos:       { title: 'EOS Import',      demo: 'report',  desc: 'Import an ETC EOS show file to match channels to fixtures.' },
  // Library
  gdtf:      { title: 'Import GDTF',     demo: 'gdtf',    desc: 'Import a GDTF fixture file from disk into your library.' },
  'gdtf-share': { title: 'GDTF Share',   demo: 'cloud',   desc: 'Browse and download fixtures from GDTF-Share.com (login remembered).' },
  // Drawing (sheet) page
  viewport:  { title: 'Viewport',        demo: 'viewport',desc: 'Drag a window onto the sheet that shows your plot at a chosen scale.' },
  note:      { title: 'Note',            demo: 'note',    desc: 'Add a callout note with a leader line on the sheet.' },
  keyblock:  { title: 'Symbol Key',      demo: 'keyblk',  desc: 'Place a legend listing each fixture type used and its symbol.' },
  sheettext: { title: 'Text',            demo: 'text',    desc: 'Add a free text label to the sheet.' },
  // Context-menu actions
  focus:     { title: 'Set Focus',       demo: 'focus',   desc: 'Click a point on stage to aim the beam — its footprint centres there.' },
  scale:     { title: 'Scale Fixture',   demo: 'scalefx', desc: 'Resize the fixture symbol on the plan.' },
  distribute:{ title: 'Distribute',      demo: 'align',   desc: 'Space fixtures evenly along the pipe / selection.' },
  swap:      { title: 'Swap Type',       demo: 'swap',    desc: 'Replace the selected fixtures with a different fixture type.' },
  duppath:   { title: 'Duplicate',       demo: 'array',   desc: 'Copy the fixture N times along a vector.' },
  lock:      { title: 'Lock / Unlock',   demo: 'lock',    desc: 'Lock an object so it can’t be moved or edited until unlocked.' },
  copy:      { title: 'Copy',            demo: 'copy',    desc: 'Copy the selection to the clipboard (Ctrl+C).' },
  paste:     { title: 'Paste',           demo: 'copy',    desc: 'Paste the clipboard (Ctrl+V).' },
};

const C = { line: '#4a90d9', node: '#00ff88', accent: '#ffd166', dim: '#5a7a9a' };

// Small looping SVG demonstrations (SMIL — no JS).
function Demo({ type }) {
  const box = { width: 130, height: 64, viewBox: '0 0 130 64' };
  const g = (children) => <svg {...box} xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>{children}</svg>;
  switch (type) {
    case 'line': return g(<>
      <line x1="20" y1="48" x2="20" y2="48" stroke={C.line} strokeWidth="2.5">
        <animate attributeName="x2" values="20;108;108;20" dur="2.6s" repeatCount="indefinite" />
        <animate attributeName="y2" values="48;16;16;48" dur="2.6s" repeatCount="indefinite" /></line>
      <circle cx="20" cy="48" r="3.5" fill={C.node} />
      <circle cx="108" cy="16" r="3.5" fill={C.node}><animate attributeName="opacity" values="0;0;1;1" dur="2.6s" repeatCount="indefinite" /></circle>
    </>);
    case 'rect': return g(<>
      <rect x="22" y="16" width="2" height="2" fill="none" stroke={C.line} strokeWidth="2">
        <animate attributeName="width" values="2;82;82;2" dur="2.6s" repeatCount="indefinite" />
        <animate attributeName="height" values="2;34;34;2" dur="2.6s" repeatCount="indefinite" /></rect>
    </>);
    case 'polyline': return g(<>
      <polyline points="18,46 18,46" fill="none" stroke={C.line} strokeWidth="2.5" strokeLinejoin="round">
        <animate attributeName="points" values="18,46 18,46;18,46 50,20;18,46 50,20 84,40;18,46 50,20 84,40 112,18" dur="3s" repeatCount="indefinite" /></polyline>
      {[[18,46],[50,20],[84,40],[112,18]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="3" fill={C.node}/>)}
    </>);
    case 'circle': return g(<circle cx="65" cy="32" r="4" fill="none" stroke={C.line} strokeWidth="2.5">
      <animate attributeName="r" values="4;26;26;4" dur="2.6s" repeatCount="indefinite" /></circle>);
    case 'arc': return g(<path fill="none" stroke={C.line} strokeWidth="2.5" d="M 95 32 A 30 30 0 0 1 95 32">
      <animate attributeName="d" values="M 95 32 A 30 30 0 0 1 95 32;M 95 32 A 30 30 0 0 1 35 32;M 95 32 A 30 30 0 1 1 65 62" dur="2.8s" repeatCount="indefinite" /></path>);
    case 'bar': return g(<>
      <line x1="18" y1="32" x2="18" y2="32" stroke={C.accent} strokeWidth="4" strokeLinecap="round">
        <animate attributeName="x2" values="18;112;112;18" dur="2.6s" repeatCount="indefinite" /></line>
    </>);
    case 'truss': return g(<g stroke={C.accent} strokeWidth="1.6" fill="none">
      {/* two rails + zig-zag lattice, drawn left→right */}
      <line x1="18" y1="24" x2="18" y2="24"><animate attributeName="x2" values="18;112;112;18" dur="2.6s" repeatCount="indefinite" /></line>
      <line x1="18" y1="40" x2="18" y2="40"><animate attributeName="x2" values="18;112;112;18" dur="2.6s" repeatCount="indefinite" /></line>
      <polyline points="18,24 30,40 42,24 54,40 66,24 78,40 90,24 102,40 112,24">
        <animate attributeName="opacity" values="0;0;1;1" dur="2.6s" repeatCount="indefinite" /></polyline>
    </g>);
    case 'gdtf': return g(<>
      <rect x="34" y="14" width="62" height="40" rx="3" fill="none" stroke={C.line} strokeWidth="1.5" />
      <circle cx="50" cy="34" r="8" fill="none" stroke={C.accent} strokeWidth="1.5" />
      <text x="74" y="38" fontSize="13" fontWeight="700" fill={C.node} textAnchor="middle">GDTF
        <animate attributeName="opacity" values="0;0;1;1" dur="2.2s" repeatCount="indefinite" /></text>
    </>);
    case 'cloud': return g(<>
      <path d="M 44 34 a 10 10 0 0 1 20 -3 a 8 8 0 0 1 8 8 h -30 a 8 8 0 0 1 2 -5 z" fill="none" stroke={C.line} strokeWidth="1.5" />
      <line x1="58" y1="36" x2="58" y2="50" stroke={C.node} strokeWidth="2"><animate attributeName="y2" values="36;50;50" dur="1.6s" repeatCount="indefinite" /></line>
      <path d="M 52 46 l 6 6 l 6 -6" fill="none" stroke={C.node} strokeWidth="2"><animate attributeName="opacity" values="0;1;1" dur="1.6s" repeatCount="indefinite" /></path>
    </>);
    case 'viewport': return g(<>
      <rect x="28" y="14" width="74" height="40" rx="2" fill="none" stroke={C.line} strokeWidth="1.5" strokeDasharray="4 2">
        <animate attributeName="width" values="6;74;74" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="height" values="4;40;40" dur="2.4s" repeatCount="indefinite" /></rect>
      <line x1="40" y1="40" x2="92" y2="40" stroke={C.accent} strokeWidth="2" /><circle cx="50" cy="40" r="3" fill={C.line} />
    </>);
    case 'note': return g(<>
      <rect x="50" y="14" width="56" height="26" rx="2" fill="rgba(255,209,102,0.12)" stroke={C.accent} strokeWidth="1.5" />
      {[20,27,34].map((y,i)=><line key={i} x1="56" y1={y} x2={i===2?86:98} y2={y} stroke={C.accent} strokeWidth="1.5" />)}
      <line x1="50" y1="40" x2="30" y2="54" stroke={C.accent} strokeWidth="1.5" /><circle cx="30" cy="54" r="2.5" fill={C.accent} />
    </>);
    case 'keyblk': return g(<>
      <rect x="34" y="12" width="62" height="44" rx="2" fill="none" stroke={C.line} strokeWidth="1.5" />
      {[0,1,2].map(i=><g key={i}><circle cx="46" cy={24+i*12} r="4" fill="none" stroke={C.accent} strokeWidth="1.3"/>
        <line x1="56" y1={24+i*12} x2="86" y2={24+i*12} stroke={C.dim} strokeWidth="2"/></g>)}
    </>);
    case 'focus': return g(<>
      <path d="M 40 12 l 0 8 M 40 12 l 8 0" stroke={C.line} strokeWidth="2" fill="none" />
      <circle cx="78" cy="44" r="3" fill="none" stroke={C.node} strokeWidth="2">
        <animate attributeName="cx" values="60;95;78" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="cy" values="44;30;44" dur="2.4s" repeatCount="indefinite" /></circle>
      <line x1="40" y1="20" x2="78" y2="44" stroke={C.accent} strokeWidth="1.2" strokeDasharray="3 2">
        <animate attributeName="x2" values="60;95;78" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="y2" values="44;30;44" dur="2.4s" repeatCount="indefinite" /></line>
      <ellipse cx="78" cy="44" rx="14" ry="8" fill="rgba(255,216,107,0.15)" stroke={C.accent} strokeWidth="1">
        <animate attributeName="cx" values="60;95;78" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="cy" values="44;30;44" dur="2.4s" repeatCount="indefinite" /></ellipse>
    </>);
    case 'scalefx': return g(<circle cx="65" cy="32" r="8" fill="none" stroke={C.line} strokeWidth="2">
      <animate attributeName="r" values="8;20;8" dur="2.2s" repeatCount="indefinite" /></circle>);
    case 'swap': return g(<>
      <circle cx="42" cy="32" r="10" fill="rgba(74,144,217,0.4)" stroke={C.line} strokeWidth="1.5">
        <animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite" /></circle>
      <rect x="78" y="22" width="20" height="20" rx="2" fill="none" stroke={C.node} strokeWidth="1.5">
        <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" /></rect>
      <path d="M 56 28 l 12 0 l -3 -3 M 68 36 l -12 0 l 3 3" stroke={C.accent} strokeWidth="1.5" fill="none" />
    </>);
    case 'lock': return g(<>
      <rect x="52" y="30" width="26" height="20" rx="2" fill="none" stroke={C.accent} strokeWidth="2" />
      <path d="M 57 30 v -5 a 8 8 0 0 1 16 0 v 5" fill="none" stroke={C.accent} strokeWidth="2">
        <animate attributeName="d" values="M 57 30 v -5 a 8 8 0 0 1 16 0 v 5;M 57 30 v -8 a 8 8 0 0 1 16 -2 v 0;M 57 30 v -5 a 8 8 0 0 1 16 0 v 5" dur="2.4s" repeatCount="indefinite" /></path>
      <circle cx="65" cy="40" r="2.5" fill={C.accent} />
    </>);
    case 'copy': return g(<>
      <rect x="40" y="20" width="26" height="30" rx="2" fill="none" stroke={C.dim} strokeWidth="1.5" />
      <rect x="40" y="20" width="26" height="30" rx="2" fill="rgba(74,144,217,0.25)" stroke={C.line} strokeWidth="1.5">
        <animate attributeName="x" values="40;58;58" dur="2s" repeatCount="indefinite" />
        <animate attributeName="y" values="20;14;14" dur="2s" repeatCount="indefinite" /></rect>
    </>);
    case 'text': return g(<>
      <text x="48" y="44" fontSize="34" fontWeight="700" fill={C.line} fontFamily="serif">T</text>
      <rect x="70" y="18" width="2" height="28" fill={C.node}><animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite" /></rect>
    </>);
    case 'measure': return g(<>
      <line x1="20" y1="32" x2="110" y2="32" stroke={C.node} strokeWidth="1.5" strokeDasharray="5 3" />
      <line x1="20" y1="24" x2="20" y2="40" stroke={C.node} strokeWidth="1.5" />
      <line x1="110" y1="24" x2="110" y2="40" stroke={C.node} strokeWidth="1.5" />
      <text x="65" y="22" fontSize="11" fill={C.node} textAnchor="middle">4500mm</text>
    </>);
    case 'ruler': return g(<>
      <rect x="18" y="26" width="94" height="14" fill="none" stroke={C.line} strokeWidth="1.5" />
      {[0,1,2,3,4,5,6].map(i=><line key={i} x1={18+i*15.6} y1="26" x2={18+i*15.6} y2="33" stroke={C.line} strokeWidth="1" />)}
      <text x="65" y="54" fontSize="10" fill={C.dim} textAnchor="middle">set real size</text>
    </>);
    case 'select': return g(<>
      <rect x="24" y="18" width="50" height="30" fill="rgba(0,170,255,0.12)" stroke={C.line} strokeWidth="1.5" strokeDasharray="4 2">
        <animate attributeName="width" values="2;50;50" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="height" values="2;30;30" dur="2.4s" repeatCount="indefinite" /></rect>
      <path d="M 70 34 l 0 22 l 6 -6 l 5 9 l 4 -2 l -5 -9 l 8 0 z" fill="#e0e0e0" stroke="#0d1117" strokeWidth="1">
        <animateTransform attributeName="transform" type="translate" values="0 0;-8 -6;0 0" dur="2.4s" repeatCount="indefinite" /></path>
    </>);
    case 'snap': return g(<>
      <line x1="18" y1="48" x2="100" y2="20" stroke={C.dim} strokeWidth="1.5" />
      <rect x="95" y="15" width="10" height="10" fill="none" stroke={C.node} strokeWidth="2" />
      <path d="M 60 56 l 0 -14 l 4 4 l 3 -6 l 3 1 l -3 6 l 5 0 z" fill="#e0e0e0">
        <animateTransform attributeName="transform" type="translate" values="0 0;40 -33;40 -33" dur="2.4s" repeatCount="indefinite" /></path>
    </>);
    case 'mirror': return g(<>
      <line x1="65" y1="8" x2="65" y2="56" stroke={C.accent} strokeWidth="1.5" strokeDasharray="4 3" />
      <path d="M 30 20 l 18 0 l -18 24 z" fill="rgba(74,144,217,0.5)" stroke={C.line} strokeWidth="1.5" />
      <path d="M 100 20 l -18 0 l 18 24 z" fill="none" stroke={C.node} strokeWidth="1.5">
        <animate attributeName="opacity" values="0;0;1;1" dur="2.4s" repeatCount="indefinite" /></path>
    </>);
    case 'array': return g(<>
      {[0,1,2].map(c=>[0,1].map(r=>{
        const first = c===0&&r===0;
        return <rect key={`${c}${r}`} x={20+c*34} y={14+r*26} width="20" height="16" rx="2"
          fill={first?'rgba(74,144,217,0.5)':'none'} stroke={C.line} strokeWidth="1.5">
          {!first && <animate attributeName="opacity" values="0;0;1;1" dur="2.4s" repeatCount="indefinite" />}</rect>;
      }))}
    </>);
    case 'offset': return g(<>
      <line x1="20" y1="22" x2="110" y2="22" stroke={C.line} strokeWidth="2" />
      <line x1="20" y1="22" x2="110" y2="22" stroke={C.node} strokeWidth="2">
        <animate attributeName="y1" values="22;42;42" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="y2" values="22;42;42" dur="2.4s" repeatCount="indefinite" /></line>
    </>);
    case 'align': return g(<>
      <line x1="22" y1="10" x2="22" y2="54" stroke={C.accent} strokeWidth="1.5" strokeDasharray="3 3" />
      {[14,30,46].map((y,i)=><rect key={i} x={40+i*8} y={y} width="22" height="10" rx="2" fill="none" stroke={C.line} strokeWidth="1.5">
        <animate attributeName="x" values={`${40+i*8};24;24`} dur="2.4s" repeatCount="indefinite" /></rect>)}
    </>);
    case 'corner': return g(<>
      <line x1="20" y1="50" x2="70" y2="50" stroke={C.line} strokeWidth="2">
        <animate attributeName="x2" values="70;95;95" dur="2.4s" repeatCount="indefinite" /></line>
      <line x1="95" y1="14" x2="95" y2="40" stroke={C.line} strokeWidth="2">
        <animate attributeName="y2" values="40;50;50" dur="2.4s" repeatCount="indefinite" /></line>
      <circle cx="95" cy="50" r="3" fill={C.node}><animate attributeName="opacity" values="0;0;1;1" dur="2.4s" repeatCount="indefinite" /></circle>
    </>);
    case 'group': return g(<>
      <rect x="30" y="20" width="18" height="14" rx="2" fill="rgba(74,144,217,0.4)" stroke={C.line} strokeWidth="1.5" />
      <rect x="60" y="30" width="18" height="14" rx="2" fill="rgba(74,144,217,0.4)" stroke={C.line} strokeWidth="1.5" />
      <rect x="24" y="14" width="62" height="36" rx="3" fill="none" stroke={C.accent} strokeWidth="1.5" strokeDasharray="4 2">
        <animate attributeName="opacity" values="0;0;1;1" dur="2.2s" repeatCount="indefinite" /></rect>
    </>);
    case 'delete': return g(<>
      <rect x="48" y="20" width="34" height="24" rx="2" fill="rgba(252,129,129,0.25)" stroke="#fc8181" strokeWidth="1.5">
        <animate attributeName="opacity" values="1;1;0.15;1" dur="2s" repeatCount="indefinite" /></rect>
      <g stroke="#fc8181" strokeWidth="2"><line x1="58" y1="26" x2="72" y2="38" /><line x1="72" y1="26" x2="58" y2="38" /></g>
    </>);
    case 'zoom': return g(<>
      <circle cx="56" cy="28" r="16" fill="none" stroke={C.line} strokeWidth="2.5">
        <animate attributeName="r" values="12;18;12" dur="2.2s" repeatCount="indefinite" /></circle>
      <line x1="68" y1="40" x2="82" y2="54" stroke={C.line} strokeWidth="3" strokeLinecap="round" />
    </>);
    case 'grid': return g(<g stroke={C.dim} strokeWidth="1">
      {[0,1,2,3].map(i=><line key={`v${i}`} x1={30+i*22} y1="12" x2={30+i*22} y2="52" />)}
      {[0,1,2].map(i=><line key={`h${i}`} x1="30" y1={12+i*20} x2="96" y2={12+i*20} />)}
      <rect x="30" y="12" width="66" height="40" fill="none"><animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" /></rect>
    </g>);
    case 'image': return g(<>
      <rect x="32" y="14" width="66" height="40" rx="2" fill="none" stroke={C.line} strokeWidth="1.5" />
      <circle cx="48" cy="28" r="5" fill={C.accent} />
      <path d="M 34 50 l 18 -16 l 12 10 l 10 -8 l 12 14 z" fill="rgba(74,144,217,0.4)" stroke={C.line} strokeWidth="1" />
    </>);
    case 'report': return g(<>
      <rect x="40" y="12" width="50" height="44" rx="2" fill="#0d1b2a" stroke={C.line} strokeWidth="1.5" />
      {[0,1,2,3].map(i=><line key={i} x1="46" y1={22+i*9} x2="84" y2={22+i*9} stroke={C.dim} strokeWidth="2">
        <animate attributeName="x2" values="46;84;84" dur="2s" begin={`${i*0.2}s`} repeatCount="indefinite" /></line>)}
    </>);
    case 'place': return g(<>
      <circle cx="65" cy="14" r="6" fill={C.line}><animate attributeName="cy" values="14;42;42" dur="1.8s" repeatCount="indefinite" /></circle>
      <line x1="40" y1="48" x2="90" y2="48" stroke={C.dim} strokeWidth="2" />
    </>);
    case 'cable': return g(<>
      <path d="M 18 48 q 30 -40 50 0 q 20 30 44 -8" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="6 5">
        <animate attributeName="stroke-dashoffset" values="22;0" dur="1s" repeatCount="indefinite" /></path>
    </>);
    case 'gear': return g(<g transform="translate(65,32)">
      <g fill="none" stroke={C.line} strokeWidth="2"><circle r="9" />
        {[0,45,90,135,180,225,270,315].map(a=>{const r=a*Math.PI/180;return <line key={a} x1={Math.cos(r)*11} y1={Math.sin(r)*11} x2={Math.cos(r)*16} y2={Math.sin(r)*16}/>;})}
      </g>
      <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite" additive="sum" /></g>);
    default: return g(<circle cx="65" cy="32" r="10" fill="none" stroke={C.line} strokeWidth="2" />);
  }
}

export default function ToolHint({ id, rect }) {
  const h = TOOL_HINTS[id];
  if (!h || !rect) return null;
  const W = 220;
  const left = Math.max(6, Math.min(rect.left, window.innerWidth - W - 8));
  const top = rect.bottom + 8;
  return (
    <div style={{ ...S.pop, top, left, width: W }}>
      <div style={S.demoBox}><Demo type={h.demo} /></div>
      <div style={S.title}>{h.title}</div>
      <div style={S.desc}>{h.desc}</div>
    </div>
  );
}

const S = {
  pop: {
    position: 'fixed', zIndex: 1400, background: '#0d1b2a', border: '1px solid #2a5a8a',
    borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.85)', padding: 10,
    pointerEvents: 'none',
  },
  demoBox: { background: '#0a1424', border: '1px solid #16324f', borderRadius: 5, padding: 4, display: 'flex', justifyContent: 'center', marginBottom: 8 },
  title: { fontSize: 13, fontWeight: 700, color: '#e0e0e0', marginBottom: 3 },
  desc: { fontSize: 11, color: '#a0aec0', lineHeight: 1.45 },
};
