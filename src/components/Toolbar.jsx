import React, { useState, useRef, useEffect, useCallback } from 'react';
import ToolHint from './ToolHint';
import Icon from './Icon';

const CAD_EDIT_TOOLS = [
  { id: 'line',      label: 'Line',      key: 'L' },
  { id: 'rect',      label: 'Rectangle', key: 'E' },
  { id: 'polyline',  label: 'Polyline',  key: null },
  { id: 'circle',    label: 'Circle',    key: null },
  { id: 'arc',       label: 'Arc',       key: null },
  { id: 'pipe',      label: 'Pipe',      key: 'P' },
  { id: 'truss',     label: 'Truss',     key: null },
  { id: 'text',      label: 'Text',      key: 'T' },
  { id: 'dimension', label: 'Measure',   key: 'M' },
  { id: 'calibrate', label: 'Calibrate', key: 'C' },
];

const INFRA_TOOLS = [
  { id: 'infra-distro',  label: 'PDU',     title: 'Place Power Distribution Unit' },
  { id: 'infra-node',    label: 'Node',    title: 'Place DMX Node' },
  { id: 'infra-switch',  label: 'Switch',  title: 'Place Network Switch' },
  { id: 'infra-netport', label: 'NetPort', title: 'Place Network Port / Floor Box' },
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
  userName, onUserClick,
  onMirror, onArray, onOffset, onAlign, onCorner, hasSelection, canCorner,
  zoom,
  onImportPdf, onImportImage,
  onShowPatch, onShow3D,
  onGroup, onUngroup, canGroup, canUngroup,
  activeMode, onSetMode,
  animating, onToggleAnimation,
  onShowCableReport,
  onShowEOSImport,
  onStudioSettings,
  onAppSettings,
  onReportFixture, onReportChannel,
  features = [],
  onLockedClick,
}) {
  const has = (f) => features.includes(f);
  // Features the license doesn't include are shown dimmed with a lock rather
  // than hidden, so users can discover them. Clicking opens My License.
  const lockedTitle = (name) => `${name} — not included in your license. Click to see your license details.`;
  const LockedBtn = ({ icon, label, name }) => (
    <button style={{ ...styles.btn, ...styles.locked }} title={lockedTitle(name || label)} aria-label={`${label} (locked)`} onClick={onLockedClick}>
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <Icon name={icon} />
        <Icon name="lock" size={9} strokeWidth={2.5} style={styles.lockBadge} />
      </span>
      <span style={styles.label}>{label}</span>
    </button>
  );
  const [snapMenu, setSnapMenu] = useState(false);
  const [snapAnchor, setSnapAnchor] = useState({ top: 0, left: 0 });
  const [barHeight, setBarHeight] = useState(DEFAULT_BAR_HEIGHT);
  const [canScroll, setCanScroll] = useState(false);
  const scrollRef = useRef(null);
  const snapWrapRef = useRef(null);
  const snapPopRef = useRef(null);
  const [hint, setHint] = useState(null); // { id, rect } animated tooltip
  const hintTimer = useRef(null);

  // Delegated hover → show the animated tool hint after a short delay.
  const onHoverOver = (e) => {
    const el = e.target.closest?.('[data-hint]');
    if (!el) return;
    const id = el.getAttribute('data-hint');
    const rect = el.getBoundingClientRect();
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint({ id, rect }), 350);
  };
  const onHoverOut = (e) => {
    const to = e.relatedTarget;
    if (to && to.closest?.('[data-hint]')) return; // moving between tools
    clearTimeout(hintTimer.current);
    setHint(null);
  };
  useEffect(() => () => clearTimeout(hintTimer.current), []);

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
    const h = (e) => {
      if (snapWrapRef.current?.contains(e.target)) return;
      if (snapPopRef.current?.contains(e.target)) return;
      setSnapMenu(false);
    };
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
          {has('cable_routing') ? (
            <button title="Cabling — place infrastructure and draw cables"
              style={{ ...styles.modeBtn, ...(activeMode === 'cable' ? styles.modeBtnActiveCable : {}) }}
              onClick={() => onSetMode('cable')}>Cable</button>
          ) : (
            <button title={lockedTitle('Cable routing mode')} style={{ ...styles.modeBtn, ...styles.locked }} onClick={onLockedClick}><Icon name="lock" size={10} style={{ marginRight: 4, verticalAlign: -1 }} />Cable</button>
          )}
          {has('sheet_editor') ? (
            <button title="Drawing — compose viewports, annotations, title block"
              style={{ ...styles.modeBtn, ...(activeMode === 'sheet' ? styles.modeBtnActiveSheet : {}) }}
              onClick={() => onSetMode('sheet')}>Drawing</button>
          ) : (
            <button title={lockedTitle('Drawing sheet editor')} style={{ ...styles.modeBtn, ...styles.locked }} onClick={onLockedClick}><Icon name="lock" size={10} style={{ marginRight: 4, verticalAlign: -1 }} />Drawing</button>
          )}
        </div>

        <div ref={scrollRef} style={toolScrollStyle} onMouseOver={onHoverOver} onMouseOut={onHoverOut}>

          {activeMode === 'cad' && (
            <>
              <div style={styles.divider} />
              <div style={styles.group}>
                <button title="Select (V)" data-hint="select"
                  style={{ ...styles.btn, ...(activeTool === 'select' ? styles.active : {}) }}
                  onClick={() => onToolChange('select')}>
                  <Icon name="select" />
                  <span style={styles.label}>Select</span>
                </button>
                {has('cad_edit') && CAD_EDIT_TOOLS
                  .filter(t => t.id !== 'dimension' || has('dimensioning'))
                  .map(t => (
                  <button key={t.id} title={t.key ? `${t.label} (${t.key})` : t.label} data-hint={t.id}
                    style={{ ...styles.btn, ...(activeTool === t.id ? styles.active : {}) }}
                    onClick={() => onToolChange(t.id)}>
                    <Icon name={t.id} />
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
                      <button data-hint="snap" style={{ ...styles.btn, ...(snap.enabled ? styles.active : {}), minWidth: 36, paddingRight: 2 }}
                        title="Object Snap on/off (F3). Hold Ctrl to bypass, Shift to constrain angle. Click ▾ for individual snaps." onClick={() => onSnapChange?.({ ...snap, enabled: !snap.enabled })}>
                        <Icon name="snap" /><span style={styles.label}>Snap</span>
                      </button>
                      <button style={styles.caret} title="Snap settings — choose which snaps are active" aria-label="Snap settings" aria-haspopup="true" aria-expanded={snapMenu}
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setSnapAnchor({ top: r.bottom + 4, left: r.left - 120 });
                          setSnapMenu(o => !o);
                        }}>▾</button>
                    </div>
                  </div>

                  <div style={styles.divider} />
                  <div style={styles.group}>
                    <button data-hint="mirror" style={{ ...styles.btn, ...(hasSelection ? {} : styles.disabled) }} disabled={!hasSelection}
                      title="Mirror selection" onClick={onMirror}>
                      <Icon name="mirror" /><span style={styles.label}>Mirror</span>
                    </button>
                    <button data-hint="array" style={{ ...styles.btn, ...(hasSelection ? {} : styles.disabled) }} disabled={!hasSelection}
                      title="Array (grid / radial copies)" onClick={onArray}>
                      <Icon name="array" /><span style={styles.label}>Array</span>
                    </button>
                    <button data-hint="offset" style={{ ...styles.btn, ...(hasSelection ? {} : styles.disabled) }} disabled={!hasSelection}
                      title="Offset (parallel copy)" onClick={onOffset}>
                      <Icon name="offset" /><span style={styles.label}>Offset</span>
                    </button>
                    <button data-hint="align" style={{ ...styles.btn, ...(hasSelection ? {} : styles.disabled) }} disabled={!hasSelection}
                      title="Align / distribute selection" onClick={onAlign}>
                      <Icon name="align" /><span style={styles.label}>Align</span>
                    </button>
                    <button data-hint="corner" style={{ ...styles.btn, ...(canCorner ? {} : styles.disabled) }} disabled={!canCorner}
                      title="Trim / extend two selected lines to meet at a corner" onClick={onCorner}>
                      <Icon name="corner" /><span style={styles.label}>Corner</span>
                    </button>
                  </div>
                </>
              )}

              {has('cad_edit') && (
                <>
                  <div style={styles.divider} />
                  <div style={styles.group}>
                    {canUngroup ? (
                      <button data-hint="ungroup" style={styles.btn} title="Ungroup (Ctrl+G)" onClick={onUngroup}>
                        <Icon name="ungroup" /><span style={styles.label}>Ungroup</span>
                      </button>
                    ) : (
                      <button data-hint="group" style={{ ...styles.btn, ...(canGroup ? {} : styles.disabled) }}
                        title="Group (Ctrl+G)" onClick={onGroup} disabled={!canGroup}>
                        <Icon name="group" /><span style={styles.label}>Group</span>
                      </button>
                    )}
                    <button data-hint="delete" style={styles.btn} title="Delete selected (Del)" onClick={onDelete}>
                      <Icon name="delete" /><span style={styles.label}>Delete</span>
                    </button>
                  </div>
                </>
              )}

              <div style={styles.divider} />
              <div style={styles.group}>
                <button data-hint="zoomin" style={styles.btn} title="Zoom In" aria-label="Zoom in" onClick={onZoomIn}><Icon name="zoomin" /></button>
                <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
                <button data-hint="zoomout" style={styles.btn} title="Zoom Out" aria-label="Zoom out" onClick={onZoomOut}><Icon name="zoomout" /></button>
                <button data-hint="fit" style={styles.btn} title="Fit to window (Ctrl+0)" aria-label="Fit to window" onClick={onFit}><Icon name="fit" /><span style={styles.label}>Fit</span></button>
                <button data-hint="grid" style={{ ...styles.btn, ...(showGrid ? styles.active : {}) }}
                  title="Toggle Grid" onClick={onToggleGrid}>
                  <Icon name="grid" /><span style={styles.label}>Grid</span>
                </button>
                <button data-hint="view3d" style={styles.btn} title="3D model view (orbit, pan, zoom)" onClick={onShow3D}>
                  <Icon name="view3d" /><span style={styles.label}>3D View</span>
                </button>
              </div>

              <div style={styles.divider} />
              <div style={styles.group}>
                {has('pdf_background') ? (
                  <>
                    <button data-hint="pdf" style={styles.btn} title="Import PDF background" onClick={onImportPdf}>
                      <Icon name="pdf" /><span style={styles.label}>PDF Bg</span>
                    </button>
                    <button data-hint="image" style={styles.btn} title="Place image" onClick={onImportImage}>
                      <Icon name="image" /><span style={styles.label}>Image</span>
                    </button>
                  </>
                ) : (
                  <LockedBtn icon="pdf" label="PDF Bg" name="PDF / image backgrounds" />
                )}
                {has('patch_panel') ? (
                  <button data-hint="patch" style={styles.btn} title="DMX Patch" onClick={onShowPatch}>
                    <Icon name="patch" /><span style={styles.label}>Patch</span>
                  </button>
                ) : (
                  <LockedBtn icon="patch" label="Patch" name="DMX patch panel" />
                )}
              </div>

              <div style={styles.divider} />
              <div style={styles.group}>
                {has('reports') ? (
                  <>
                    <button data-hint="fixtures" style={styles.btn} title="Fixture Schedule report" onClick={onReportFixture}>
                      <Icon name="fixtures" /><span style={styles.label}>Fixtures</span>
                    </button>
                    <button data-hint="channels" style={styles.btn} title="Channel List report" onClick={onReportChannel}>
                      <Icon name="channels" /><span style={styles.label}>Channels</span>
                    </button>
                  </>
                ) : (
                  <LockedBtn icon="fixtures" label="Reports" name="Fixture & channel reports" />
                )}
              </div>

              <div style={styles.divider} />
              <div style={styles.group}>
                <button data-hint="studio" title="Studio Settings" style={styles.btn} onClick={onStudioSettings}>
                  <Icon name="studio" /><span style={styles.label}>Studio</span>
                </button>
              </div>
            </>
          )}

          {activeMode === 'cable' && has('cable_routing') && (
            <>
              <div style={styles.divider} />
              <div style={styles.group}>
                {INFRA_TOOLS.map(t => (
                  <button key={t.id} title={t.title} data-hint={t.id}
                    style={{ ...styles.btn, ...(activeTool === t.id ? styles.active : {}) }}
                    onClick={() => onToolChange(t.id)}>
                    <Icon name={t.id} />
                    <span style={styles.label}>{t.label}</span>
                  </button>
                ))}
              </div>

              <div style={styles.divider} />
              <div style={styles.group}>
                {CABLE_TOOLS.map(t => {
                  const isActive = activeTool === t.id;
                  return (
                    <button key={t.id} title={t.title} data-hint={t.id}
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
                <button data-hint="anim" title="Toggle animation" style={{ ...styles.btn, ...(animating ? styles.active : {}) }} onClick={onToggleAnimation}>
                  <Icon name="anim" /><span style={styles.label}>Anim</span>
                </button>
                <button data-hint="report" title="Cable Report" style={styles.btn} onClick={onShowCableReport}>
                  <Icon name="report" /><span style={styles.label}>Report</span>
                </button>
                {has('eos_import') ? (
                  <button data-hint="eos" title="Import EOS Patch" style={styles.btn} onClick={onShowEOSImport}>
                    <Icon name="eos" /><span style={styles.label}>EOS Import</span>
                  </button>
                ) : (
                  <LockedBtn icon="eos" label="EOS Import" name="EOS patch import" />
                )}
              </div>

              <div style={styles.divider} />
              <div style={styles.group}>
                <button data-hint="delete" style={styles.btn} title="Delete selected (Del)" onClick={onDelete}>
                  <Icon name="delete" /><span style={styles.label}>Delete</span>
                </button>
                <button data-hint="zoomin" style={styles.btn} title="Zoom In" aria-label="Zoom in" onClick={onZoomIn}><Icon name="zoomin" /></button>
                <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
                <button data-hint="zoomout" style={styles.btn} title="Zoom Out" aria-label="Zoom out" onClick={onZoomOut}><Icon name="zoomout" /></button>
                <button data-hint="fit" style={styles.btn} title="Fit to window (Ctrl+0)" aria-label="Fit to window" onClick={onFit}><Icon name="fit" /><span style={styles.label}>Fit</span></button>
                <button data-hint="studio" style={styles.btn} title="Studio Settings" onClick={onStudioSettings}>
                  <Icon name="studio" /><span style={styles.label}>Studio</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Scroll-right affordance when the tools overflow */}
        {canScroll && (
          <button style={styles.scrollArrow} title="More tools — scroll" aria-label="Scroll to more tools" onClick={scrollRight}><Icon name="more" /></button>
        )}

        {/* Licence holder name — click to open My License */}
        {userName ? <button style={styles.userName} title="View My License" onClick={onUserClick}><Icon name="user" size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{userName}</button> : null}
      </div>

      {/* Animated hover hint */}
      {hint && <ToolHint id={hint.id} rect={hint.rect} />}

      {/* Resize handle (drag to make the ribbon taller — tools wrap to rows) */}
      <div style={styles.resizeHandle} onMouseDown={startResize} title="Drag to resize ribbon" />

      {/* Snap settings popover — rendered here (fixed) so the toolbar's overflow
          clipping doesn't hide it. */}
      {snapMenu && (
        <div ref={snapPopRef} style={{ ...styles.snapPop, top: snapAnchor.top, left: snapAnchor.left }}>
          <div style={styles.snapPopTitle}>Snap to</div>
          {SNAP_OPTIONS.map(([k, l]) => (
            <label key={k} style={styles.snapRow}>
              <input type="checkbox" checked={!!snap[k]} disabled={!snap.enabled && k !== 'grid'}
                onChange={e => onSnapChange?.({ ...snap, [k]: e.target.checked })}
                style={{ accentColor: 'var(--accent)' }} />
              <span>{l}</span>
            </label>
          ))}
          <div style={styles.snapHint}>Object Snap {snap.enabled ? 'ON' : 'OFF'} — toggle with the Snap button or F3.</div>
        </div>
      )}
    </div>
  );
}

const styles = {
  toolbar: {
    display: 'flex', alignItems: 'center',
    background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)',
    padding: '4px 8px', gap: 4, flexShrink: 0,
    overflow: 'hidden',
  },
  modeSwitcher: {
    display: 'flex', borderRadius: 5, overflow: 'hidden',
    border: '1px solid var(--border)', flexShrink: 0, alignSelf: 'center',
  },
  toolScroll: {
    display: 'flex', alignItems: 'center', gap: 4,
    flex: 1, height: '100%',
    scrollbarWidth: 'thin', msOverflowStyle: 'none',
  },
  scrollArrow: {
    flexShrink: 0, width: 22, height: 36, background: 'var(--border)', border: '1px solid var(--border-accent-2)',
    borderRadius: 4, color: 'var(--accent-soft)', cursor: 'pointer', fontSize: 18, lineHeight: 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  userName: {
    flexShrink: 0, marginLeft: 8, paddingLeft: 10, borderLeft: '1px solid var(--border)',
    color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap', alignSelf: 'center',
    background: 'none', border: 'none', borderLeftWidth: 1, borderLeftStyle: 'solid', borderLeftColor: 'var(--border)',
    cursor: 'pointer',
  },
  resizeHandle: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 5,
    cursor: 'ns-resize', zIndex: 5,
  },
  modeBtn: {
    background: 'var(--bg-inset)', border: '1px solid transparent', color: 'var(--text-dim)',
    cursor: 'pointer', padding: '5px 12px', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.05em', transition: 'all 0.15s',
  },
  modeBtnActive:      { background: 'var(--border)', color: 'var(--accent-bright)', border: '1px solid var(--accent)' },
  modeBtnActiveCable: { background: '#1a2a0a', color: 'var(--success-text)', border: '1px solid #2d6a4f' },
  modeBtnActiveSheet: { background: '#0f2a4a', color: 'var(--accent-text)', border: '1px solid var(--border-accent)' },
  group:   { display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 },
  divider: { width: 1, height: 32, background: 'var(--border)', margin: '0 4px', flexShrink: 0 },
  btn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: '1px solid transparent', borderRadius: 4,
    color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px',
    minWidth: 40, height: 38, fontSize: 11, transition: 'all 0.1s',
  },
  caret: {
    background: 'var(--bg-inset)', border: '1px solid var(--border-accent-2)', borderRadius: 4, color: 'var(--accent-soft)',
    cursor: 'pointer', fontSize: 11, padding: '0 4px', marginLeft: 2, alignSelf: 'center', height: 30,
  },
  snapPop: {
    position: 'fixed', zIndex: 1300,
    background: 'var(--bg-panel)', border: '1px solid var(--border-accent-2)', borderRadius: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.85)', padding: '8px 10px', minWidth: 170,
  },
  snapPopTitle: { fontSize: 9, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 },
  snapRow: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-2)', padding: '3px 0', cursor: 'pointer' },
  snapHint: { fontSize: 10, color: 'var(--text-faint)', marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)', lineHeight: 1.4 },
  active:   { background: 'var(--border)', border: '1px solid var(--accent-bright)', color: 'var(--accent-bright)' },
  disabled: { opacity: 0.4, cursor: 'not-allowed' },
  locked:   { opacity: 0.45, cursor: 'help' },
  icon:     { fontSize: 15, lineHeight: 1 },
  lockBadge:{ position: 'absolute', right: -5, bottom: -3, background: 'var(--bg-panel)', borderRadius: 2 },
  label:    { fontSize: 9, marginTop: 2, letterSpacing: '0.05em' },
  zoomLabel:{ color: 'var(--text-muted)', fontSize: 11, minWidth: 38, textAlign: 'center' },
};
