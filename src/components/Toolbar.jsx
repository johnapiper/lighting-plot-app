import React, { useState, useRef, useEffect, useCallback } from 'react';

const CAD_EDIT_TOOLS = [
  { id: 'line',      label: 'Line',      icon: '╱', key: 'L' },
  { id: 'rect',      label: 'Rectangle', icon: '▭', key: 'E' },
  { id: 'polyline',  label: 'Polyline',  icon: '⊿', key: null },
  { id: 'circle',    label: 'Circle',    icon: '◯', key: null },
  { id: 'arc',       label: 'Arc',       icon: '◜', key: null },
  { id: 'pipe',      label: 'Pipe',      icon: '━', key: 'P' },
  { id: 'truss',     label: 'Truss',     icon: '⊞', key: null },
  { id: 'text',      label: 'Text',      icon: 'T', key: 'T' },
  { id: 'dimension', label: 'Measure',   icon: '⟷', key: 'M' },
  { id: 'calibrate', label: 'Calibrate', icon: '📐', key: 'C' },
];

const INFRA_TOOLS = [
  { id: 'infra-distro',  label: 'PDU',     icon: '⚡', title: 'Place Power Distribution Unit' },
  { id: 'infra-node',    label: 'Node',    icon: '🎛', title: 'Place DMX Node' },
  { id: 'infra-switch',  label: 'Switch',  icon: '🌐', title: 'Place Network Switch' },
  { id: 'infra-netport', label: 'NetPort', icon: '🔌', title: 'Place Network Port / Floor Box' },
];

const CABLE_TOOLS = [
  { id: 'cable-power',   label: 'Power',   color: '#f59e0b', title: 'Draw power cable' },
  { id: 'cable-dmx',     label: 'DMX',     color: '#a78bfa', title: 'Draw DMX cable / chain' },
  { id: 'cable-network', label: 'Net',     color: '#34d399', title: 'Draw network cable' },
];

const SNAP_OPTIONS = [
  ['endpoint', 'Endpoint'], ['midpoint', 'Midpoint'], ['center', 'Centre'],
  ['intersection', 'Intersection'], ['nearest', 'Nearest'], ['grid', 'Grid'],
  ['pipe', 'Pipe / structure'],
];

const DEFAULT_BAR_HEIGHT = 50;

export default function Toolbar({
  activeTool, onToolChange,
  onDelete, onZoomIn, onZoomOut, onFit,
  showGrid, onToggleGrid,
  snap = {}, onSnapChange,
  userName,
  onMirror, onArray, onOffset, onAlign, onCorner, hasSelection, canCorner,
  zoom,
  onImportPdf, onImportImage,
  onShowPatch,
  onGroup, onUngroup, canGroup, canUngroup,
  activeMode, onSetMode,
  animating, onToggleAnimation,
  onShowCableReport,
  onShowEOSImport,
  onStudioSettings,
  onAppSettings,
  onReportFixture, onReportChannel,
  features = [],
}) {
  const has = (f) => features.includes(f);
  const [snapMenu, setSnapMenu] = useState(false);
  const [snapAnchor, setSnapAnchor] = useState({ top: 0, left: 0 });
  const [barHeight, setBarHeight] = useState(DEFAULT_BAR_HEIGHT);
  const [canScroll, setCanScroll] = useState(false);
  const scrollRef = useRef(null);
  const snapWrapRef = useRef(null);

  const wrapMode = barHeight > 62; // taller bar → wrap tools onto multiple rows

  // Track horizontal overflow so we can show a scroll affordance.
  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) { setCanScroll(false); return; }
    setCanScroll(!wrapMode && el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, [wrapMode]);
  useEffect(() => {
    updateScroll();
    const el = scrollRef.current;
    el?.addEventListener('scroll', updateScroll);
    window.addEventListener('resize', updateScroll);
    return () => { el?.removeEventListener('scroll', updateScroll); window.removeEventListener('resize', updateScroll); };
  }, [updateScroll, activeMode, features]);

  // Close the snap popover on outside click.
  useEffect(() => {
    if (!snapMenu) return;
    const h = (e) => { if (snapWrapRef.current && !snapWrapRef.current.contains(e.target)) setSnapMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [snapMenu]);

  function startResize(e) {
    e.preventDefault();
    const startY = e.clientY, startH = barHeight;
    const move = (ev) => setBarHeight(Math.max(DEFAULT_BAR_HEIGHT, Math.min(180, startH + (ev.clientY - startY))));
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  }

  const scrollRight = () => { scrollRef.current?.scrollBy({ left: 240, behavior: 'smooth' }); };

  const toolScrollStyle = {
    ...styles.toolScroll,
    flexWrap: wrapMode ? 'wrap' : 'nowrap',
    overflowX: wrapMode ? 'hidden' : 'auto',
    overflowY: wrapMode ? 'auto' : 'hidden',
    alignContent: 'center',
  };

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ ...styles.toolbar, height: barHeight }}>
        {/* ── Mode switcher ── */}
        <div style={styles.modeSwitcher}>
          <button title="CAD — place fixtures, pipes, lines"
            style={{ ...styles.modeBtn, ...(activeMode === 'cad' ? styles.modeBtnActive : {}) }}
            onClick={() => onSetMode('cad')}>CAD</button>
          {has('cable_routing') && (
            <button title="Cabling — place infrastructure and draw cables"
              style={{ ...styles.modeBtn, ...(activeMode === 'cable' ? styles.modeBtnActiveCable : {}) }}
              onClick={() => onSetMode('cable')}>Cable</button>
          )}
          {has('sheet_editor') && (
            <button title="Drawing — compose viewports, annotations, title block"
              style={{ ...styles.modeBtn, ...(activeMode === 'sheet' ? styles.modeBtnActiveSheet : {}) }}
              onClick={() => onSetMode('sheet')}>Drawing</button>
          )}
        </div>

        <div ref={scrollRef} style={toolScrollStyle}>

          {activeMode === 'cad' && (
            <>
              <div style={styles.divider} />
              <div style={styles.group}>
                <button title="Select (V)"
                  style={{ ...styles.btn, ...(activeTool === 'select' ? styles.active : {}) }}
                  onClick={() => onToolChange('select')}>
                  <span style={styles.icon}>↖</span>
                  <span style={styles.label}>Select</span>
                </button>
                {has('cad_edit') && CAD_EDIT_TOOLS
                  .filter(t => t.id !== 'dimension' || has('dimensioning'))
                  .map(t => (
                  <button key={t.id} title={t.key ? `${t.label} (${t.key})` : t.label}
                    style={{ ...styles.btn, ...(activeTool === t.id ? styles.active : {}) }}
                    onClick={() => onToolChange(t.id)}>
                    <span style={styles.icon}>{t.icon}</span>
                    <span style={styles.label}>{t.label}</span>
                  </button>
                ))}
              </div>

              {has('cad_edit') && (
                <>
                  <div style={styles.divider} />
                  {/* Snap: single OSnap toggle + popover of individual snap modes */}
                  <div style={styles.group} ref={snapWrapRef}>
                    <div style={{ display: 'flex' }}>
                      <button style={{ ...styles.btn, ...(snap.enabled ? styles.active : {}), minWidth: 36, paddingRight: 2 }}
                        title="Object Snap on/off (F3). Hold Ctrl to bypass, Shift to constrain angle. Click ▾ for individual snaps." onClick={() => onSnapChange?.({ ...snap, enabled: !snap.enabled })}>
                        <span style={styles.icon}>⊹</span><span style={styles.label}>Snap</span>
                      </button>
                      <button style={styles.caret} title="Snap settings — choose which snaps are active"
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setSnapAnchor({ top: r.bottom + 4, left: r.left - 120 });
                          setSnapMenu(o => !o);
                        }}>▾</button>
                    </div>
                  </div>

                  <div style={styles.divider} />
                  <div style={styles.group}>
                    <button style={{ ...styles.btn, ...(hasSelection ? {} : styles.disabled) }} disabled={!hasSelection}
                      title="Mirror selection" onClick={onMirror}>
                      <span style={styles.icon}>🪞</span><span style={styles.label}>Mirror</span>
                    </button>
                    <button style={{ ...styles.btn, ...(hasSelection ? {} : styles.disabled) }} disabled={!hasSelection}
                      title="Array (grid / radial copies)" onClick={onArray}>
                      <span style={styles.icon}>▦</span><span style={styles.label}>Array</span>
                    </button>
                    <button style={{ ...styles.btn, ...(hasSelection ? {} : styles.disabled) }} disabled={!hasSelection}
                      title="Offset (parallel copy)" onClick={onOffset}>
                      <span style={styles.icon}>⇇</span><span style={styles.label}>Offset</span>
                    </button>
                    <button style={{ ...styles.btn, ...(hasSelection ? {} : styles.disabled) }} disabled={!hasSelection}
                      title="Align / distribute selection" onClick={onAlign}>
                      <span style={styles.icon}>⊟</span><span style={styles.label}>Align</span>
                    </button>
                    <button style={{ ...styles.btn, ...(canCorner ? {} : styles.disabled) }} disabled={!canCorner}
                      title="Trim / extend two selected lines to meet at a corner" onClick={onCorner}>
                      <span style={styles.icon}>∟</span><span style={styles.label}>Corner</span>
                    </button>
                  </div>
                </>
              )}

              {has('cad_edit') && (
                <>
                  <div style={styles.divider} />
                  <div style={styles.group}>
                    {canUngroup ? (
                      <button style={styles.btn} title="Ungroup (Ctrl+G)" onClick={onUngroup}>
                        <span style={styles.icon}>⬚</span><span style={styles.label}>Ungroup</span>
                      </button>
                    ) : (
                      <button style={{ ...styles.btn, ...(canGroup ? {} : styles.disabled) }}
                        title="Group (Ctrl+G)" onClick={onGroup} disabled={!canGroup}>
                        <span style={styles.icon}>⊟</span><span style={styles.label}>Group</span>
                      </button>
                    )}
                    <button style={styles.btn} title="Delete selected (Del)" onClick={onDelete}>
                      <span style={styles.icon}>🗑</span><span style={styles.label}>Delete</span>
                    </button>
                  </div>
                </>
              )}

              <div style={styles.divider} />
              <div style={styles.group}>
                <button style={styles.btn} title="Zoom In" onClick={onZoomIn}>+</button>
                <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
                <button style={styles.btn} title="Zoom Out" onClick={onZoomOut}>−</button>
                <button style={styles.btn} title="Fit to window" onClick={onFit}>Fit</button>
                <button style={{ ...styles.btn, ...(showGrid ? styles.active : {}) }}
                  title="Toggle Grid" onClick={onToggleGrid}>
                  <span style={styles.icon}>⊞</span><span style={styles.label}>Grid</span>
                </button>
              </div>

              {(has('pdf_background') || has('patch_panel')) && (
                <>
                  <div style={styles.divider} />
                  <div style={styles.group}>
                    {has('pdf_background') && (
                      <>
                        <button style={styles.btn} title="Import PDF background" onClick={onImportPdf}>
                          <span style={styles.icon}>📄</span><span style={styles.label}>PDF Bg</span>
                        </button>
                        <button style={styles.btn} title="Place image" onClick={onImportImage}>
                          <span style={styles.icon}>🖼</span><span style={styles.label}>Image</span>
                        </button>
                      </>
                    )}
                    {has('patch_panel') && (
                      <button style={styles.btn} title="DMX Patch" onClick={onShowPatch}>
                        <span style={styles.icon}>⚡</span><span style={styles.label}>Patch</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              {has('reports') && (
                <>
                  <div style={styles.divider} />
                  <div style={styles.group}>
                    <button style={styles.btn} title="Fixture Schedule report" onClick={onReportFixture}>
                      <span style={styles.icon}>📋</span><span style={styles.label}>Fixtures</span>
                    </button>
                    <button style={styles.btn} title="Channel List report" onClick={onReportChannel}>
                      <span style={styles.icon}>🔢</span><span style={styles.label}>Channels</span>
                    </button>
                  </div>
                </>
              )}

              <div style={styles.divider} />
              <div style={styles.group}>
                <button title="Studio Settings" style={styles.btn} onClick={onStudioSettings}>
                  <span style={styles.icon}>⚙️</span><span style={styles.label}>Studio</span>
                </button>
              </div>
            </>
          )}

          {activeMode === 'cable' && has('cable_routing') && (
            <>
              <div style={styles.divider} />
              <div style={styles.group}>
                {INFRA_TOOLS.map(t => (
                  <button key={t.id} title={t.title}
                    style={{ ...styles.btn, ...(activeTool === t.id ? styles.active : {}) }}
                    onClick={() => onToolChange(t.id)}>
                    <span style={styles.icon}>{t.icon}</span>
                    <span style={styles.label}>{t.label}</span>
                  </button>
                ))}
              </div>

              <div style={styles.divider} />
              <div style={styles.group}>
                {CABLE_TOOLS.map(t => {
                  const isActive = activeTool === t.id;
                  return (
                    <button key={t.id} title={t.title}
                      style={{ ...styles.btn, border: `1px solid ${isActive ? t.color : 'rgba(255,255,255,0.08)'}`,
                        background: isActive ? `${t.color}22` : undefined, color: isActive ? t.color : undefined }}
                      onClick={() => onToolChange(isActive ? 'select' : t.id)}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: t.color, flexShrink: 0, boxShadow: isActive ? `0 0 6px ${t.color}` : 'none' }} />
                      <span style={styles.label}>{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <div style={styles.divider} />
              <div style={styles.group}>
                <button title="Toggle animation" style={{ ...styles.btn, ...(animating ? styles.active : {}) }} onClick={onToggleAnimation}>
                  <span style={styles.icon}>▶</span><span style={styles.label}>Anim</span>
                </button>
                <button title="Cable Report" style={styles.btn} onClick={onShowCableReport}>
                  <span style={styles.icon}>📋</span><span style={styles.label}>Report</span>
                </button>
                {has('eos_import') && (
                  <button title="Import EOS Patch" style={styles.btn} onClick={onShowEOSImport}>
                    <span style={styles.icon}>🎛</span><span style={styles.label}>EOS Import</span>
                  </button>
                )}
              </div>

              <div style={styles.divider} />
              <div style={styles.group}>
                <button style={styles.btn} title="Delete selected (Del)" onClick={onDelete}>
                  <span style={styles.icon}>🗑</span><span style={styles.label}>Delete</span>
                </button>
                <button style={styles.btn} title="Zoom In" onClick={onZoomIn}>+</button>
                <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
                <button style={styles.btn} title="Zoom Out" onClick={onZoomOut}>−</button>
                <button style={styles.btn} title="Fit to window" onClick={onFit}>Fit</button>
                <button style={styles.btn} title="Studio Settings" onClick={onStudioSettings}>
                  <span style={styles.icon}>⚙️</span><span style={styles.label}>Studio</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Scroll-right affordance when the tools overflow */}
        {canScroll && (
          <button style={styles.scrollArrow} title="More tools — scroll" onClick={scrollRight}>›</button>
        )}

        {/* Licence holder name */}
        {userName ? <div style={styles.userName} title="Licensed to">👤 {userName}</div> : null}
      </div>

      {/* Resize handle (drag to make the ribbon taller — tools wrap to rows) */}
      <div style={styles.resizeHandle} onMouseDown={startResize} title="Drag to resize ribbon" />
    </div>
  );
}

const styles = {
  toolbar: {
    display: 'flex', alignItems: 'center',
    background: '#16213e', borderBottom: '1px solid #0f3460',
    padding: '4px 8px', gap: 4, flexShrink: 0,
    overflow: 'hidden',
  },
  modeSwitcher: {
    display: 'flex', borderRadius: 5, overflow: 'hidden',
    border: '1px solid #0f3460', flexShrink: 0, alignSelf: 'center',
  },
  toolScroll: {
    display: 'flex', alignItems: 'center', gap: 4,
    flex: 1, height: '100%',
    scrollbarWidth: 'thin', msOverflowStyle: 'none',
  },
  scrollArrow: {
    flexShrink: 0, width: 22, height: 36, background: '#0f3460', border: '1px solid #2a5a8a',
    borderRadius: 4, color: '#90cdf4', cursor: 'pointer', fontSize: 18, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  userName: {
    flexShrink: 0, marginLeft: 8, paddingLeft: 10, borderLeft: '1px solid #0f3460',
    color: '#a0aec0', fontSize: 11, whiteSpace: 'nowrap', alignSelf: 'center',
  },
  resizeHandle: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 5,
    cursor: 'ns-resize', zIndex: 5,
  },
  modeBtn: {
    background: '#0d1b2a', border: '1px solid transparent', color: '#718096',
    cursor: 'pointer', padding: '5px 12px', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.05em', transition: 'all 0.15s',
  },
  modeBtnActive:      { background: '#0f3460', color: '#00aaff', border: '1px solid #4a90d9' },
  modeBtnActiveCable: { background: '#1a2a0a', color: '#68d391', border: '1px solid #2d6a4f' },
  modeBtnActiveSheet: { background: '#0f2a4a', color: '#60b0ff', border: '1px solid #2a6090' },
  group:   { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  divider: { width: 1, height: 32, background: '#0f3460', margin: '0 4px', flexShrink: 0 },
  btn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: '1px solid transparent', borderRadius: 4,
    color: '#a0aec0', cursor: 'pointer', padding: '2px 6px',
    minWidth: 40, height: 38, fontSize: 11, transition: 'all 0.1s',
  },
  caret: {
    background: 'transparent', border: '1px solid transparent', color: '#718096',
    cursor: 'pointer', fontSize: 10, padding: '0 3px', alignSelf: 'stretch',
  },
  snapPop: {
    position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
    background: '#16213e', border: '1px solid #0f3460', borderRadius: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.8)', padding: '8px 10px', minWidth: 150,
  },
  snapPopTitle: { fontSize: 9, fontWeight: 700, color: '#4a90d9', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 },
  snapRow: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: '#c0c8d8', padding: '3px 0', cursor: 'pointer' },
  active:   { background: '#0f3460', border: '1px solid #00aaff', color: '#00aaff' },
  disabled: { opacity: 0.4, cursor: 'not-allowed' },
  icon:     { fontSize: 15, lineHeight: 1 },
  label:    { fontSize: 9, marginTop: 2, letterSpacing: '0.05em' },
  zoomLabel:{ color: '#a0aec0', fontSize: 11, minWidth: 38, textAlign: 'center' },
};
