const TRUTHY = new Set(["1", "true", "yes", "on"]);

/**
 * FLING_PERSISTENT_SHELL gates the persistent adb-shell pool path during
 * rollout. Off by default; on for any of 1/true/yes/on (case-insensitive).
 * Removed in Stage 4 once the pool path is stable.
 */
export function isPersistentShellEnabled(): boolean {
  const v = (process.env.FLING_PERSISTENT_SHELL ?? "").trim().toLowerCase();
  return TRUTHY.has(v);
}
