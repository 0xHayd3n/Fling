import type { AppState, Toast } from "./types";
import type { Device } from "@eleutex/fling/devices";
import type {
  DeployStartedEvt, DeployDoneEvt,
  MirrorStartRes, MirrorResizeEvt, MirrorEndedEvt,
  RecentProject,
} from "../../main/ipc/channels";

export type Action =
  | { type: "DEVICES_CHANGED"; devices: Device[] }
  | { type: "ADB_PROBE"; ok: boolean }
  | { type: "SELECT_DEVICE"; deviceId: string | null }
  | { type: "SET_PROJECT"; project: { path: string; name: string } | null }
  | { type: "SET_RECENT_PROJECTS"; recent: RecentProject[] }
  | { type: "MIRROR_STARTING"; deviceId: string }
  | { type: "MIRROR_STARTED"; res: MirrorStartRes; deviceId: string }
  | { type: "MIRROR_STOPPED" }
  | { type: "MIRROR_RESIZED"; evt: MirrorResizeEvt }
  | { type: "MIRROR_ENDED"; evt: MirrorEndedEvt }
  | { type: "DEPLOY_STARTED"; evt: DeployStartedEvt; toastId: string }
  | { type: "DEPLOY_DONE"; evt: DeployDoneEvt }
  | { type: "TOAST_ADD"; toast: Toast }
  | { type: "TOAST_UPDATE"; id: string; patch: Partial<Toast> }
  | { type: "TOAST_DISMISS"; id: string }
  | { type: "MODAL_OPEN"; modal: keyof AppState["modals"] }
  | { type: "MODAL_CLOSE"; modal: keyof AppState["modals"] };

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
      return { ...state, mirror: { ...state.mirror, status: "starting", deviceId: action.deviceId } };
    case "MIRROR_STARTED":
      return {
        ...state,
        mirror: {
          mirrorId: action.res.mirrorId,
          deviceId: action.deviceId,
          width: action.res.width,
          height: action.res.height,
          status: "running",
          configNal: new Uint8Array(action.res.configNal),
          firstKeyNal: new Uint8Array(action.res.firstKeyNal),
          firstKeyPts: action.res.firstKeyPts,
        },
      };
    case "MIRROR_STOPPED":
      return { ...state, mirror: { mirrorId: null, deviceId: null, width: 0, height: 0, status: "off", configNal: null, firstKeyNal: null, firstKeyPts: 0 } };
    case "MIRROR_RESIZED":
      return { ...state, mirror: { ...state.mirror, width: action.evt.width, height: action.evt.height } };
    case "MIRROR_ENDED":
      return { ...state, mirror: { mirrorId: null, deviceId: null, width: 0, height: 0, status: "off", configNal: null, firstKeyNal: null, firstKeyPts: 0 } };
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
  }
}
