import type { Device } from "@eleutex/fling/devices";

export const Channels = {
  // Renderer → main (invoke)
  projectOpen: "fling.project.open",
  projectRecent: "fling.project.recent",
  devicesList: "fling.devices.list",
  deployRun: "fling.deploy.run",
  deployCancel: "fling.deploy.cancel",
  mirrorStart: "fling.mirror.start",
  mirrorStop: "fling.mirror.stop",
  mirrorInput: "fling.mirror.input",
  pairingStart: "fling.pairing.start",
  configRead: "fling.config.read",
  configWrite: "fling.config.write",
  windowMinimize: "fling.window.minimize",
  windowMaximize: "fling.window.maximize",
  windowClose: "fling.window.close",
  windowSetAlwaysOnTop: "fling.window.setAlwaysOnTop",
  windowSetOpacity: "fling.window.setOpacity",
  windowGetBounds: "fling.window.getBounds",
  windowSetBounds: "fling.window.setBounds",
  // Main → renderer (send)
  devicesChanged: "fling.devices.changed",
  adbProbe: "fling.adb.probe",
  deployStarted: "fling.deploy.started",
  deployDone: "fling.deploy.done",
  mirrorFrame: "fling.mirror.frame",
  mirrorResize: "fling.mirror.resize",
  mirrorEnded: "fling.mirror.ended",
} as const;

export interface ProjectInfo { path: string; name: string; hasGradle: boolean; hasFlingConfig: boolean; }
export interface RecentProject { path: string; name: string; lastOpened: number; }

export interface DeployRunReq { projectPath: string; deviceId: string; }
export interface DeployRunRes { runId: string; }
export interface DeployCancelReq { runId: string; }
export interface DeployCancelRes { cancelled: boolean; }
export interface DeployStartedEvt { runId: string; }
export interface DeployDoneEvt {
  runId: string;
  success: boolean;
  finalMessage: string;
  durationMs: number;
  failedStep?: string;
}

export interface MirrorStartReq { deviceId: string; maxResolution?: number; bitrate?: number; }
export interface MirrorStartRes {
  mirrorId: string;
  width: number;
  height: number;
  configNal: ArrayBuffer;
  firstKeyNal: ArrayBuffer;
  firstKeyPts: number;
}
export interface MirrorStopReq { mirrorId: string; }

export type MirrorInputEvent =
  | { kind: "touch"; bytes: ArrayBuffer }
  | { kind: "key"; bytes: ArrayBuffer };

export interface MirrorInputReq { mirrorId: string; event: MirrorInputEvent; }
export interface MirrorFrameEvt { mirrorId: string; nal: Uint8Array; pts: number; isConfig: boolean; isKey: boolean; }
export interface MirrorResizeEvt { mirrorId: string; width: number; height: number; }
export interface MirrorEndedEvt { mirrorId: string; reason: string; }

export interface PairingStartReq { host: string; port: number; code: string; }

export interface FlingConfig {
  version: 1;
  window: { x: number; y: number; width: number; height: number };
  recentProjects: RecentProject[];
  wireless: { lastHost: string | null; lastPort: number | null };
  mirror: {
    maxResolution: number;
    bitrateBps: number;
    autoMirrorOnLaunch: boolean;
    defaultDeviceSerial: string | null;
  };
  knownDevices: { serial: string; model: string; lastSeen: number }[];
}

export interface DevicesChangedEvt { devices: Device[]; }
export interface AdbProbeEvt { ok: boolean; reason?: string; }

export interface WindowBounds { x: number; y: number; width: number; height: number; }
