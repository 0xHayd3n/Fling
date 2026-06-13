import type {
  ProjectInfo, RecentProject,
  DeployRunReq, DeployRunRes, DeployCancelReq, DeployCancelRes,
  DeployStartedEvt, DeployDoneEvt,
  MirrorStartReq, MirrorStartRes, MirrorStopReq, MirrorInputReq,
  MirrorFrameEvt, MirrorResizeEvt, MirrorEndedEvt,
  PairingStartQrRes, PairingStartWithCodeReq, PairingStatusEvt, FlingConfig, DevicesChangedEvt, AdbProbeEvt,
  WindowBounds,
} from "../main/ipc/channels";
import type { Device } from "@0xhayd3n/fling/devices";

export interface FlingApi {
  version: string;
  project: {
    open: () => Promise<ProjectInfo | null>;
    recent: () => Promise<RecentProject[]>;
  };
  devices: { list: () => Promise<Device[]>; };
  deploy: {
    run: (req: DeployRunReq) => Promise<DeployRunRes>;
    cancel: (req: DeployCancelReq) => Promise<DeployCancelRes>;
  };
  mirror: {
    start: (req: MirrorStartReq) => Promise<MirrorStartRes>;
    stop: (req: MirrorStopReq) => Promise<{}>;
    input: (req: MirrorInputReq) => Promise<void>;
  };
  pairing: {
    startQr: () => Promise<PairingStartQrRes>;
    startWithCode: (req: PairingStartWithCodeReq) => Promise<{ ok: true }>;
    cancel: () => Promise<void>;
  };
  config: {
    read: () => Promise<FlingConfig>;
    write: (patch: Partial<FlingConfig>) => Promise<{ written: true }>;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    setAlwaysOnTop: (pinned: boolean) => Promise<void>;
    setOpacity: (opacity: number) => Promise<void>;
    getBounds: () => Promise<WindowBounds>;
    setBounds: (bounds: WindowBounds) => Promise<void>;
  };
  on: {
    devicesChanged: (cb: (e: DevicesChangedEvt) => void) => () => void;
    adbProbe: (cb: (e: AdbProbeEvt) => void) => () => void;
    deployStarted: (cb: (e: DeployStartedEvt) => void) => () => void;
    deployDone: (cb: (e: DeployDoneEvt) => void) => () => void;
    mirrorFrame: (cb: (e: MirrorFrameEvt) => void) => () => void;
    mirrorResize: (cb: (e: MirrorResizeEvt) => void) => () => void;
    mirrorEnded: (cb: (e: MirrorEndedEvt) => void) => () => void;
    pairingStatus: (cb: (e: PairingStatusEvt) => void) => () => void;
  };
}

declare global { interface Window { fling: FlingApi; } }
