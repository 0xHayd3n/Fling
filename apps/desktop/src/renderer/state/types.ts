import type { Device } from "@eleutex/fling/devices";
import type { RecentProject } from "../../main/ipc/channels";

export interface AppState {
  currentProject: { path: string; name: string } | null;
  recentProjects: RecentProject[];
  devices: Device[];
  selectedDeviceId: string | null;
  adbOk: boolean;
  mirror: {
    mirrorId: string | null;
    deviceId: string | null;
    width: number;
    height: number;
    // off:        no session
    // starting:   IPC mirror.start is in flight
    // running:    session active, frames decoding
    // stopping:   user requested stop, awaiting cleanup
    // error:      session ended unexpectedly; errorReason holds the cause
    status: "off" | "starting" | "running" | "stopping" | "error";
    errorReason: string | null;
    configNal: Uint8Array | null;
    firstKeyNal: Uint8Array | null;
    firstKeyPts: number;
  };
  deploy: { runId: string | null; status: "idle" | "running"; toastId: string | null };
  toasts: Toast[];
  modals: { devicePicker: boolean; recentProjects: boolean; settings: boolean; pairing: boolean };
}

export interface Toast {
  id: string;
  kind: "progress" | "success" | "error" | "info";
  message: string;
  action?: "cancel" | "copy";
  finalMessage?: string;
  auto?: number;
}

export const INITIAL_STATE: AppState = {
  currentProject: null,
  recentProjects: [],
  devices: [],
  selectedDeviceId: null,
  adbOk: true,
  mirror: { mirrorId: null, deviceId: null, width: 0, height: 0, status: "off", errorReason: null, configNal: null, firstKeyNal: null, firstKeyPts: 0 },
  deploy: { runId: null, status: "idle", toastId: null },
  toasts: [],
  modals: { devicePicker: false, recentProjects: false, settings: false, pairing: false },
};
