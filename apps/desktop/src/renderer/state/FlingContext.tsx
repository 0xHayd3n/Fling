import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode, type Dispatch } from "react";
import { reducer, type Action } from "./reducer";
import { INITIAL_STATE, type AppState } from "./types";
import { saveWindowPrefs } from "../lib/windowPrefs";

const Ctx = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null);

export function FlingProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const offDevices = window.fling.on.devicesChanged((e) =>
      dispatch({ type: "DEVICES_CHANGED", devices: e.devices })
    );
    const offAdbProbe = window.fling.on.adbProbe((e) =>
      dispatch({ type: "ADB_PROBE", ok: e.ok })
    );
    const offDeployStarted = window.fling.on.deployStarted((e) =>
      dispatch({ type: "DEPLOY_STARTED", evt: e, toastId: e.runId })
    );
    const offDeployDone = window.fling.on.deployDone((e) =>
      dispatch({ type: "DEPLOY_DONE", evt: e })
    );
    const offMirrorResize = window.fling.on.mirrorResize((e) =>
      dispatch({ type: "MIRROR_RESIZED", evt: e })
    );
    const offMirrorEnded = window.fling.on.mirrorEnded((e) =>
      dispatch({ type: "MIRROR_ENDED", evt: e })
    );
    const offPairingStatus = window.fling.on.pairingStatus((evt) => {
      if (evt.status.kind !== "success") return;
      // PairingDialog handles its own success toast; skip when the modal is open.
      if (stateRef.current.modals.pairing) return;
      dispatch({
        type: "TOAST_ADD",
        toast: {
          id: `reconnect-${Date.now()}`,
          kind: "success",
          message: `Reconnected · ${evt.status.model}`,
          auto: 3500,
        },
      });
    });
    void window.fling.devices.list().then((devices) =>
      dispatch({ type: "DEVICES_CHANGED", devices })
    );
    void window.fling.project.recent().then((recent) =>
      dispatch({ type: "SET_RECENT_PROJECTS", recent })
    );
    return () => {
      offDevices(); offAdbProbe(); offDeployStarted(); offDeployDone(); offMirrorResize(); offMirrorEnded(); offPairingStatus();
    };
  }, []);

  // Persist window prefs to localStorage and push them to main on every
  // change. Also runs on mount — restores pin/opacity after a restart.
  useEffect(() => {
    saveWindowPrefs(state.window);
    void window.fling.window.setAlwaysOnTop(state.window.isPinned);
    void window.fling.window.setOpacity(state.window.opacity);
  }, [state.window.isPinned, state.window.opacity]);

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useFling() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFling must be used inside FlingProvider");
  return v;
}
