import React from 'react';

const CAD_EDIT_TOOLS = [
  { id: 'line',      label: 'Line',      icon: '╱', key: 'L' },
  { id: 'rect',      label: 'Rectangle', icon: '▭', key: 'E' },
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

export default function Toolbar({
  activeTool, onToolChange,
  onDelete, onZoomIn, onZoomOut, onFit,
  showGrid, onToggleGrid,
  pipeSnap, onTogglePipeSnap,
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
  features = [],
}) {
  const has = (f) => features.includes(f);

  return (
    <div style={styles.toolbar}>
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

      <div style={styles.toolScroll}>

        {activeMode === 'cad' && (
          <>
            <div style={styles.divider} />
            <div style={styles.group}>
              {/* Select always available */}
              <button title="Select (V)"
                style={{ ...styles.btn, ...(activeTool === 'select' ? styles.active : {}) }}
                onClick={() => onToolChange('select')}>
                <span style={styles.icon}>↖</span>
                <span style={styles.label}>Select</span>
              </button>
              {/* Drawing tools only when cad_edit is licensed; Measure also needs dimensioning */}
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
                <div style={styles.group}>
                  <button style={{ ...styles.btn, ...(pipeSnap ? styles.active : {}) }}
                    title="Pipe Snap" onClick={onTogglePipeSnap}>
                    <span style={styles.icon}>🧲</span>
                    <span style={styles.label}>Snap</span>
                  </button>
                </div>
              </>
            )}

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
            </div>

            <div style={styles.divider} />
            <div style={styles.group}>
              <button style={styles.btn} title="Delete selected (Del)" onClick={onDelete}>
                <span style={styles.icon}>🗑</span><span style={styles.label}>Delete</span>
              </button>
            </div>

            <div style={styles.divider} />
            <div style={styles.group}>
              <button style={styles.btn} title="Zoom In" onClick={onZoomIn}>+</button>
              <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
              <button style={styles.btn} title="Zoom Out" onClick={onZoomOut}>−</button>
              <button style={styles.btn} title="Fit to window" onClick={onFit}>Fit</button>
            </div>

            <div style={styles.divider} />
            <div style={styles.group}>
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
            </div>

            <div style={styles.divider} />
            <div style={styles.group}>
              <button style={styles.btn} title="Zoom In" onClick={onZoomIn}>+</button>
              <span style={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
              <button style={styles.btn} title="Zoom Out" onClick={onZoomOut}>−</button>
              <button style={styles.btn} title="Fit to window" onClick={onFit}>Fit</button>
            </div>

            <div style={styles.divider} />
            <div style={styles.group}>
              <button style={styles.btn} title="Studio Settings" onClick={onStudioSettings}>
                <span style={styles.icon}>⚙️</span><span style={styles.label}>Studio</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  toolbar: {
    display: 'flex', alignItems: 'center',
    background: '#16213e', borderBottom: '1px solid #0f3460',
    padding: '4px 8px', gap: 4, flexShrink: 0, height: 48,
    overflow: 'hidden',
  },
  modeSwitcher: {
    display: 'flex', borderRadius: 5, overflow: 'hidden',
    border: '1px solid #0f3460', flexShrink: 0,
  },
  toolScroll: {
    display: 'flex', alignItems: 'center', gap: 4,
    overflowX: 'auto', flex: 1, height: '100%',
    scrollbarWidth: 'none', msOverflowStyle: 'none',
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
  active:   { background: '#0f3460', border: '1px solid #00aaff', color: '#00aaff' },
  disabled: { opacity: 0.4, cursor: 'not-allowed' },
  icon:     { fontSize: 15, lineHeight: 1 },
  label:    { fontSize: 9, marginTop: 2, letterSpacing: '0.05em' },
  zoomLabel:{ color: '#a0aec0', fontSize: 11, minWidth: 38, textAlign: 'center' },
};
