import { useState, useEffect, useCallback, useRef } from 'react';
import { findShotsMatchingName } from '../api/ftrack.js';
import { isAePanel, getActiveComp } from './bridge.js';
import { rankShotMatches } from './match.js';

/**
 * Poll active AE comp and match against ftrack shots in the given project.
 * onAutoMatch(shot, score) when confidence >= 80 — unless auto-nav is paused
 * (user manually opened a different shot). Comp change / Match resume auto-nav.
 */
export function useAeCompMatch(projectId, { onAutoMatch, enabled = true } = {}) {
  const [comp, setComp] = useState(null);
  const [matching, setMatching] = useState(false);
  const [matches, setMatches] = useState([]);
  const [matchError, setMatchError] = useState('');
  const lastCompName = useRef('');
  const matchGen = useRef(0);
  const autoNavEnabled = useRef(true);
  const onAutoMatchRef = useRef(onAutoMatch);
  onAutoMatchRef.current = onAutoMatch;

  const refreshComp = useCallback(async () => {
    if (!isAePanel() || !enabled) return null;
    try {
      const info = await getActiveComp();
      setComp((prev) => {
        if (
          prev?.ok === info?.ok &&
          prev?.name === info?.name &&
          prev?.error === info?.error
        ) {
          return prev;
        }
        return info;
      });
      return info;
    } catch {
      setComp((prev) =>
        prev?.ok === false && prev?.error === 'Bridge unavailable'
          ? prev
          : { ok: false, error: 'Bridge unavailable' },
      );
      return null;
    }
  }, [enabled]);

  useEffect(() => {
    if (!isAePanel() || !enabled) return undefined;
    refreshComp();
    const id = setInterval(refreshComp, 2000);
    return () => clearInterval(id);
  }, [refreshComp, enabled]);

  const runMatch = useCallback(async (compName) => {
    if (!projectId) {
      setMatchError('Pick a project first');
      return [];
    }
    if (!compName) {
      setMatchError('No active composition');
      return [];
    }
    const gen = ++matchGen.current;
    setMatching(true);
    setMatchError('');
    try {
      const shots = await findShotsMatchingName(projectId, compName);
      if (gen !== matchGen.current) return [];
      const ranked = rankShotMatches(compName, shots);
      setMatches(ranked);
      if (ranked[0] && ranked[0].score >= 80) {
        // Check at completion time so a mid-flight manual click wins the race
        if (autoNavEnabled.current) {
          onAutoMatchRef.current?.(ranked[0].shot, ranked[0].score);
        }
      } else if (!ranked.length) {
        setMatchError(`No shots matching "${compName}"`);
      }
      return ranked;
    } catch (e) {
      if (gen === matchGen.current) setMatchError(e.message || String(e));
      return [];
    } finally {
      if (gen === matchGen.current) setMatching(false);
    }
  }, [projectId]);

  // Auto-match when comp name changes — resume following AE
  useEffect(() => {
    if (!enabled || !isAePanel()) return;
    if (!projectId || !comp?.ok || !comp.name) return;
    if (comp.name === lastCompName.current) return;
    lastCompName.current = comp.name;
    autoNavEnabled.current = true;
    runMatch(comp.name);
  }, [comp, projectId, runMatch, enabled]);

  /** Stop auto-opening shots (manual list/detail browse). Match / new AE comp resume. */
  const pauseAutoNav = useCallback(() => {
    autoNavEnabled.current = false;
  }, []);

  const resumeAutoNav = useCallback(() => {
    autoNavEnabled.current = true;
  }, []);

  const forceRematch = useCallback(async () => {
    autoNavEnabled.current = true;
    lastCompName.current = '';
    const info = await refreshComp();
    if (info?.ok) return runMatch(info.name);
    return [];
  }, [refreshComp, runMatch]);

  const clearMatches = useCallback(() => setMatches([]), []);

  return {
    comp,
    matching,
    matches,
    matchError,
    setMatchError,
    runMatch,
    forceRematch,
    clearMatches,
    pauseAutoNav,
    resumeAutoNav,
    refreshComp,
  };
}
