import { useCallback, useRef } from "react";
import { useFling } from "./FlingContext";

// Single owner of mirror start/stop. Used by every callsite that triggers a
// mirror transition (auto-mirror in App, the toolbar button, the device
// picker). Centralizing here eliminates three subtle bugs that the earlier
// distributed callers had:
//
//   1. Double-start: rapid auto-mirror + button click would each invoke
//      mirror.start before the other resolved, producing two scrcpy
//      sessions where the renderer only knew about the second.
//   2. Stuck "stopping": if the stop IPC threw, the UI never recovered.
//   3. Device switch: stopping + starting in different callers raced and
//      sometimes skipped the intermediate MIRROR_STOPPED dispatch, leaving
//      stale configNal in state.
//
// The in-flight ref makes start/stop idempotent — a second call while one
// is pending is a no-op (returns the same promise).
export function useMirrorControl() {
  const { state, dispatch } = useFling();
  const inFlightRef = useRef<{ kind: "start" | "stop" | "switch"; promise: Promise<void> } | null>(null);

  const start = useCallback(async (deviceId: string): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current.promise;
    const promise = (async () => {
      dispatch({ type: "MIRROR_STARTING", deviceId });
      try {
        const res = await window.fling.mirror.start({ deviceId });
        dispatch({ type: "MIRROR_STARTED", res, deviceId });
      } catch (err) {
        dispatch({ type: "MIRROR_STOPPED" });
        console.error("[mirror.start]", err);
        throw err;
      }
    })();
    inFlightRef.current = { kind: "start", promise };
    try { await promise; } finally { inFlightRef.current = null; }
  }, [dispatch]);

  const stop = useCallback(async (): Promise<void> => {
    if (inFlightRef.current?.kind === "stop") return inFlightRef.current.promise;
    const mirrorId = state.mirror.mirrorId;
    if (!mirrorId) return;
    const promise = (async () => {
      dispatch({ type: "MIRROR_STOPPING" });
      try {
        await window.fling.mirror.stop({ mirrorId });
      } catch (err) {
        console.error("[mirror.stop]", err);
      } finally {
        // Always land in "off" — even if the IPC threw — so the UI is not
        // stranded in the "stopping" status.
        dispatch({ type: "MIRROR_STOPPED" });
      }
    })();
    inFlightRef.current = { kind: "stop", promise };
    try { await promise; } finally { inFlightRef.current = null; }
  }, [dispatch, state.mirror.mirrorId]);

  const switchTo = useCallback(async (deviceId: string): Promise<void> => {
    if (inFlightRef.current?.kind === "switch") return inFlightRef.current.promise;
    const currentMirrorId = state.mirror.mirrorId;
    const promise = (async () => {
      if (currentMirrorId) {
        dispatch({ type: "MIRROR_STOPPING" });
        try { await window.fling.mirror.stop({ mirrorId: currentMirrorId }); }
        catch (err) { console.error("[mirror.stop:switch]", err); }
        // Critical: dispatch MIRROR_STOPPED before STARTING the next session
        // so configNal/firstKeyNal from the prior device are cleared before
        // the canvas mounts for the new one.
        dispatch({ type: "MIRROR_STOPPED" });
      }
      dispatch({ type: "MIRROR_STARTING", deviceId });
      try {
        const res = await window.fling.mirror.start({ deviceId });
        dispatch({ type: "MIRROR_STARTED", res, deviceId });
      } catch (err) {
        dispatch({ type: "MIRROR_STOPPED" });
        console.error("[mirror.start:switch]", err);
        throw err;
      }
    })();
    inFlightRef.current = { kind: "switch", promise };
    try { await promise; } finally { inFlightRef.current = null; }
  }, [dispatch, state.mirror.mirrorId]);

  return {
    start, stop, switchTo,
    isStarting: state.mirror.status === "starting",
    isStopping: state.mirror.status === "stopping",
    isRunning: state.mirror.status === "running",
  };
}
