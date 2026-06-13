import type { AppState, Toast } from "./types";
import type { Device } from "@eleutex/fling/devices";
import type {
  DeployStartedEvt, DeployDoneEvt,
  MirrorStartRes, MirrorResizeEvt, MirrorEndedEvt,
  RecentProject,
} from "../../main/ipc/channels";
import { clampOpacity } from "../lib/windowPrefs";

export type Action =
  | { type: "DEVICES_CHANGED"; devices: Device[] }
  | { type: "ADB_PROBE"; ok: boolean }
  | { type: "SELECT_DEVICE"; deviceId: string | null }
  | { type: "SET_PROJECT"; project: { path: string; name: string } | null }
  | { type: "SET_RECENT_PROJECTS"; recent: RecentProject[] }
  | { type: "MIRROR_STARTING"; deviceId: string }
  | { type: "MIRROR_STARTED"; res: MirrorStartRes; deviceId: string }
  | { type: "MIRROR_STOPPING" }
  | { type: "MIRROR_STOPPED" }
  | { type: "MIRROR_RESIZED"; evt: MirrorResizeEvt }
  | { type: "MIRROR_ENDED"; evt: MirrorEndedEvt }
  | { type: "DEPLOY_STARTED"; evt: DeployStartedEvt; toastId: string }
  | { type: "DEPLOY_DONE"; evt: DeployDoneEvt }
  | { type: "TOAST_ADD"; toast: Toast }
  | { type: "TOAST_UPDATE"; id: string; patch: Partial<Toast> }
  | { type: "TOAST_DISMISS"; id: string }
  | { type: "MODAL_OPEN"; modal: keyof AppState["modals"] }
  | { type: "MODAL_CLOSE"; modal: keyof AppState["modals"] }
  | { type: "WINDOW_SET_PIN"; pinned: boolean }
  | { type: "WINDOW_SET_OPACITY"; opacity: number };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "DEVICES_CHANGED":
      return { ...state, devices: action.devices };
    case "ADB_PROBE":
      return { ...state, adbOk: action.ok };
    case "SELECT_DEVICE":
      return { ...state, selectedDeviceId: action.deviceId };
    case "SET_PROJECT":
      return { ...state, currentProject: action.project };
    case "SET_RECENT_PROJECTS":
      return { ...state, recentProjects: action.recent };
    case "MIRROR_STARTING":
      return { ...state, mirror: { ...state.mirror, status: "starting", deviceId: action.deviceId, errorReason: null } };
    case "MIRROR_STARTED":
      return {
        ...state,
        mirror: {
          mirrorId: action.res.mirrorId,
          deviceId: action.deviceId,
          width: action.res.width,
          height: action.res.height,
          status: "running",
          errorReason: null,
          configNal: new Uint8Array(action.res.configNal),
          firstKeyNal: new Uint8Array(action.res.firstKeyNal),
          firstKeyPts: action.res.firstKeyPts,
        },
      };
    case "MIRROR_STOPPING":
      // User-initiated stop in flight. Keep mirrorId so the stop IPC can
      // reference it; the followup MIRROR_STOPPED clears everything.
      return { ...state, mirror: { ...state.mirror, status: "stopping" } };
    case "MIRROR_STOPPED":
      return { ...state, mirror: { mirrorId: null, deviceId: null, width: 0, height: 0, status: "off", errorReason: null, configNal: null, firstKeyNal: null, firstKeyPts: 0 } };
    case "MIRROR_RESIZED":
      // Ignore resize events outside a running session. A late event arriving
      // while status is "starting" would leave mirrorId/configNal null but
      // mutate width/height, producing partially-initialized state.
      if (state.mirror.status !== "running") return state;
      if (action.evt.mirrorId !== state.mirror.mirrorId) return state;
      return { ...state, mirror: { ...state.mirror, width: action.evt.width, height: action.evt.height } };
    case "MIRROR_ENDED":
      // Unexpected end (socket close, server crash). Distinct from
      // MIRROR_STOPPED — the user did NOT request this. Surfaces reason so
      // StateHero can show a meaningful message instead of the idle hero.
      return {
        ...state,
        mirror: {
          mirrorId: null, deviceId: null, width: 0, height: 0,
          status: "error",
          errorReason: action.evt.reason,
          configNal: null, firstKeyNal: null, firstKeyPts: 0,
        },
      };
    case "DEPLOY_STARTED":
      return { ...state, deploy: { runId: action.evt.runId, status: "running", toastId: action.toastId } };
    case "DEPLOY_DONE":
      return { ...state, deploy: { runId: null, status: "idle", toastId: null } };
    case "TOAST_ADD":
      return { ...state, toasts: [...state.toasts, action.toast].slice(-3) };
    case "TOAST_UPDATE":
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
      };
    case "TOAST_DISMISS":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "MODAL_OPEN":
      return { ...state, modals: { ...state.modals, [action.modal]: true } };
    case "MODAL_CLOSE":
      return { ...state, modals: { ...state.modals, [action.modal]: false } };
    case "WINDOW_SET_PIN":
      return { ...state, window: { ...state.window, isPinned: action.pinned } };
    case "WINDOW_SET_OPACITY":
      return { ...state, window: { ...state.window, opacity: clampOpacity(action.opacity) } };
  }
}
