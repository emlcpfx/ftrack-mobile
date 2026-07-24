import { useEffect, useState } from 'react';
import { isAePanel } from '../ae/bridge.js';
import { getComponentUrl } from '../api/ftrack.js';

/** Session cache: source key → blob: URL */
const blobCache = new Map();

/**
 * Thumbnail image with CEP-safe blob fetch + clapperboard on failure.
 * CEP Chromium often fails to paint ftrack thumb URLs (302 → CDN) in <img>;
 * fetch()+blob works.
 */
export default function ThumbImg({
  src,
  componentId = null,
  className = '',
  style,
  alt = '',
  fallbackChar = '\uD83C\uDFAC',
}) {
  const [display, setDisplay] = useState(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(!!src);

  useEffect(() => {
    let cancelled = false;

    if (!src && !componentId) {
      setDisplay(null);
      setFailed(true);
      setLoading(false);
      return undefined;
    }

    setFailed(false);
    setLoading(true);

    const cacheKey = componentId ? `id:${componentId}` : `url:${src}`;

    // Web / non-CEP: paint URL directly (still onError → fallback)
    if (!isAePanel()) {
      setDisplay(src || (componentId ? getComponentUrl(componentId) : null));
      setLoading(false);
      return undefined;
    }

    if (blobCache.has(cacheKey)) {
      setDisplay(blobCache.get(cacheKey));
      setLoading(false);
      return undefined;
    }

    (async () => {
      const tryFetch = async (url) => {
        if (!url) return null;
        const res = await fetch(url, { redirect: 'follow', credentials: 'omit' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (blob.size < 32) throw new Error('empty body');
        // Reject JSON error bodies disguised as 200
        const ct = (res.headers.get('content-type') || blob.type || '').toLowerCase();
        if (ct.includes('json') || ct.includes('text/html')) throw new Error(`bad type ${ct}`);
        return URL.createObjectURL(blob);
      };

      try {
        let objectUrl = null;
        if (src) {
          try {
            objectUrl = await tryFetch(src);
          } catch {
            objectUrl = null;
          }
        }
        if (!objectUrl && componentId) {
          objectUrl = await tryFetch(getComponentUrl(componentId));
        }
        if (!objectUrl) throw new Error('no thumb');
        blobCache.set(cacheKey, objectUrl);
        if (!cancelled) {
          setDisplay(objectUrl);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setDisplay(null);
          setFailed(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, componentId]);

  if (failed || (!loading && !display)) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          background: 'var(--card2)',
          ...style,
        }}
        aria-hidden
      >
        {fallbackChar}
      </div>
    );
  }

  if (loading && !display) {
    return (
      <div
        className={className}
        style={{ background: 'var(--card2)', ...style }}
        aria-hidden
      />
    );
  }

  return (
    <img
      className={className}
      style={style}
      src={display}
      alt={alt}
      onError={() => {
        setFailed(true);
        setDisplay(null);
      }}
    />
  );
}
