/**
 * Renderer-side shim over the preload bridge (window.lplot, see preload.js).
 *
 * Exposes an `ipcRenderer` with the familiar send / invoke / on / removeListener
 * API so components don't care that Node integration is off. In a plain browser
 * (no preload) `ipcRenderer` is null and callers fall back as before.
 */

const api = typeof window !== 'undefined' ? window.lplot?.ipc : null;

function makeIpcRenderer() {
  // channel → Map(listener → subscription id)
  const listeners = new Map();
  return {
    send: (channel, ...args) => api.send(channel, ...args),
    invoke: (channel, ...args) => api.invoke(channel, ...args),
    // Handlers receive (event, ...args) like Electron's ipcRenderer; `event` is an empty object here.
    on(channel, fn) {
      const id = api.subscribe(channel, (...args) => fn({}, ...args));
      if (!listeners.has(channel)) listeners.set(channel, new Map());
      listeners.get(channel).set(fn, id);
    },
    removeListener(channel, fn) {
      const m = listeners.get(channel);
      const id = m?.get(fn);
      if (id !== undefined) { api.unsubscribe(id); m.delete(fn); }
    },
  };
}

export const ipcRenderer = api ? makeIpcRenderer() : null;

/** Open an https link in the system browser. */
export function openExternal(url) { return ipcRenderer ? ipcRenderer.invoke('open-external', url) : Promise.resolve(false); }
