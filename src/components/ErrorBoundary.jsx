import React from 'react';

/**
 * Catches render errors anywhere below it so a bug in one panel doesn't leave
 * the user with a blank window. Work is protected by the periodic auto-save:
 * "Reload" restarts the renderer, and the Recover-unsaved-work dialog offers
 * the last auto-saved copy.
 *
 * `scope="panel"` renders a compact inline fallback (used around modals and
 * side panels) instead of taking over the whole window.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, copied: false };
    this.reset = this.reset.bind(this);
    this.copy = this.copy.bind(this);
  }

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error, info) {
    this.setState({ info });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info?.componentStack);
    if (this.props.onError) { try { this.props.onError(error, info); } catch {} }
  }

  reset() { this.setState({ error: null, info: null, copied: false }); }

  details() {
    const { error, info } = this.state;
    return `${error?.stack || error?.message || String(error)}\n\nComponent stack:${info?.componentStack || ' (none)'}`;
  }

  copy() {
    try {
      navigator.clipboard.writeText(this.details()).then(() => this.setState({ copied: true }));
    } catch {}
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const panel = this.props.scope === 'panel';
    const label = this.props.label || 'this part of the app';

    return (
      <div role="alert" style={{ ...S.wrap, ...(panel ? S.wrapPanel : S.wrapFull) }}>
        <div style={S.card}>
          <div style={S.title}>Something went wrong</div>
          <p style={S.p}>
            Lighting Plot hit an unexpected error in {label}.
            {panel
              ? ' You can try again, or close this and keep working.'
              : ' Your work was auto-saved — after reloading you\'ll be offered the last auto-saved copy.'}
          </p>
          <pre style={S.pre}>{error?.message || String(error)}</pre>
          <div style={S.row}>
            <button style={S.btnPrimary} onClick={this.reset}>Try again</button>
            {!panel && <button style={S.btn} onClick={() => window.location.reload()}>Reload app</button>}
            {panel && this.props.onClose && <button style={S.btn} onClick={() => { this.reset(); this.props.onClose(); }}>Close</button>}
            <button style={S.btn} onClick={this.copy}>{this.state.copied ? 'Copied' : 'Copy details'}</button>
          </div>
        </div>
      </div>
    );
  }
}

const S = {
  wrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)' },
  wrapFull: { position: 'fixed', inset: 0, background: 'var(--bg-app)', zIndex: 99999 },
  wrapPanel: { width: '100%', height: '100%', minHeight: 160, padding: 16, boxSizing: 'border-box' },
  card: { maxWidth: 520, background: 'var(--bg-panel)', border: '1px solid var(--border-accent)', borderRadius: 8, padding: 20 },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 8 },
  p: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 10px' },
  pre: {
    fontSize: 11, color: 'var(--text-dim)', background: 'var(--bg-inset)', border: '1px solid var(--border)',
    borderRadius: 4, padding: 8, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap', margin: '0 0 14px',
  },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  btn: { background: 'var(--bg-hover)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
  btnPrimary: { background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)', borderRadius: 4, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
};
