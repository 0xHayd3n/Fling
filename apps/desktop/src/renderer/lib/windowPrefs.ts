export interface WindowPrefs {
  isPinned: boolean;
  opacity: number; // [0.3, 1.0]
}

export const DEFAULT_PREFS: WindowPrefs = { isPinned: false, opacity: 1.0 };

const STORAGE_KEY = "fling.window";
const MIN_OPACITY = 0.3;
const MAX_OPACITY = 1.0;

export function clampOpacity(opacity: unknown): number {
  const n = Number(opacity);
  if (!Number.isFinite(n)) return MAX_OPACITY;
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, n));
}

export function loadWindowPrefs(): WindowPrefs {
  if (typeof localStorage === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      isPinned: Boolean(parsed.isPinned),
      opacity: clampOpacity(parsed.opacity),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveWindowPrefs(prefs: WindowPrefs): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage quota or disabled — silently skip.
  }
}
