import { useCallback, useEffect, useState } from "react";

const MAX_RECENTS = 10;
const STORAGE_PREFIX = "tokentrack.recent";

function storageKey(namespace: string, platformId: string): string {
  return `${STORAGE_PREFIX}.${namespace}.${platformId}`;
}

/** Reads the current recent-value list for one field/platform. Never throws. */
export function loadRecentValues(namespace: string, platformId: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(namespace, platformId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Moves `value` to the front of the recent list (deduping any earlier
 * occurrence), caps at MAX_RECENTS, and never numerically sorts — the
 * order is purely "most recently used first". Blank values are ignored
 * so a cleared/abandoned field never pollutes the list.
 */
export function pushRecentValue(namespace: string, platformId: string, value: string): string[] {
  const trimmed = value.trim();
  const current = loadRecentValues(namespace, platformId);
  if (!trimmed) return current;
  const next = [trimmed, ...current.filter((v) => v !== trimmed)].slice(0, MAX_RECENTS);
  try {
    window.localStorage.setItem(storageKey(namespace, platformId), JSON.stringify(next));
  } catch {
    /* storage unavailable — recents just won't persist this session */
  }
  return next;
}

/** React binding: recent values for one field/platform, plus a setter that also persists. */
export function useRecentValues(namespace: string, platformId: string) {
  const [values, setValues] = useState<string[]>(() => loadRecentValues(namespace, platformId));

  // The dialog this is used in can stay mounted while the selected platform
  // changes, so re-read whenever platformId changes rather than only at mount.
  useEffect(() => {
    setValues(loadRecentValues(namespace, platformId));
  }, [namespace, platformId]);

  const push = useCallback(
    (value: string) => {
      setValues(pushRecentValue(namespace, platformId, value));
    },
    [namespace, platformId],
  );

  const reload = useCallback(() => {
    setValues(loadRecentValues(namespace, platformId));
  }, [namespace, platformId]);

  return { values, push, reload };
}
