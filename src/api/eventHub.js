/**
 * ftrack EventHub helpers — live updates for AE alerts / status.
 */

import { getSession } from './ftrack.js';

let _connected = false;
const _handlers = new Set();

async function ensureHub() {
  const s = getSession();
  const hub = s?.eventHub;
  if (!hub) return null;
  if (!_connected) {
    try {
      if (typeof hub.connect === 'function') {
        await hub.connect();
      }
      _connected = true;
    } catch (err) {
      console.warn('[eventHub] connect failed:', err?.message || err);
      return null;
    }
  }
  return hub;
}

/**
 * Subscribe to ftrack.update events. Returns unsubscribe fn.
 * Falls back silently if EventHub unavailable (keep pollers).
 */
export function subscribeFtrackUpdates(onEvent) {
  if (typeof onEvent !== 'function') return () => {};

  let subId = null;
  let cancelled = false;

  (async () => {
    const hub = await ensureHub();
    if (!hub || cancelled) return;
    try {
      const handler = (event) => {
        try {
          onEvent(event);
        } catch (e) {
          console.warn('[eventHub] handler error:', e);
        }
      };
      _handlers.add(handler);
      if (typeof hub.subscribe === 'function') {
        subId = hub.subscribe('topic=ftrack.update', handler);
      }
    } catch (err) {
      console.warn('[eventHub] subscribe failed:', err?.message || err);
    }
  })();

  return () => {
    cancelled = true;
    try {
      const s = getSession();
      const hub = s?.eventHub;
      if (hub && subId != null && typeof hub.unsubscribe === 'function') {
        hub.unsubscribe(subId);
      }
    } catch {
      /* ignore */
    }
  };
}

/**
 * Debounced refresh helper for alert badges.
 */
export function subscribeAlertRefresh(refreshFn, { debounceMs = 800 } = {}) {
  let timer = null;
  const kick = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        refreshFn();
      } catch (e) {
        console.warn('[eventHub] refresh failed:', e);
      }
    }, debounceMs);
  };
  const unsub = subscribeFtrackUpdates(() => kick());
  return () => {
    if (timer) clearTimeout(timer);
    unsub();
  };
}
