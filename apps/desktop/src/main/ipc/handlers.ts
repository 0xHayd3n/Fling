import { ipcMain, type BrowserWindow } from "electron";
import { Channels, type FlingConfig, type MirrorInputReq, type MirrorStartReq, type MirrorStopReq } from "./channels";
import type { DeviceWatcher } from "../deviceWatcher";
import { listDevices } from "@eleutex/fling/devices";
import type { ScrcpyManager } from "../scrcpyClient";

const DEFAULT_CONFIG: FlingConfig = {
  version: 1,
  window: { x: 100, y: 100, width: 720, height: 540 },
  recentProjects: [],
  wireless: { lastHost: null, lastPort: null },
  mirror: {
    maxResolution: 1080,
    bitrateBps: 4_000_000,
    autoMirrorOnLaunch: false,
    defaultDeviceSerial: null,
  },
  knownDevices: [],
};

export function registerIpcHandlers(opts: {
  watcher: DeviceWatcher;
  getWindow: () => BrowserWindow | null;
  scrcpy: ScrcpyManager;
}) {
  ipcMain.handle(Channels.projectOpen, async () => null);
  ipcMain.handle(Channels.projectRecent, async () => []);
  ipcMain.handle(Channels.devicesList, async () => {
    const snap = opts.watcher.snapshot();
    return snap.length > 0 ? snap : await listDevices();
  });
  ipcMain.handle(Channels.deployRun, async () => ({ runId: "stub" }));
  ipcMain.handle(Channels.deployCancel, async () => ({ cancelled: false }));

  ipcMain.handle(Channels.mirrorStart, async (_e, req: MirrorStartReq) => {
    const sess = await opts.scrcpy.start(req.deviceId, {
      maxResolution: req.maxResolution,
      bitrate: req.bitrate,
    });
    return { mirrorId: sess.mirrorId, width: sess.width, height: sess.height };
  });
  ipcMain.handle(Channels.mirrorStop, async (_e, req: MirrorStopReq) => {
    await opts.scrcpy.stop(req.mirrorId);
    return {};
  });
  ipcMain.handle(Channels.mirrorInput, async (_e, req: MirrorInputReq) => {
    if (req.event && req.event.kind === "touch" && req.event.bytes) {
      opts.scrcpy.send(req.mirrorId, new Uint8Array(req.event.bytes));
    }
  });

  ipcMain.handle(Channels.pairingStart, async () => ({ paired: true }));
  ipcMain.handle(Channels.configRead, async () => DEFAULT_CONFIG);
  ipcMain.handle(Channels.configWrite, async () => ({ written: true }));

  ipcMain.handle(Channels.windowMinimize, async () => { opts.getWindow()?.minimize(); });
  ipcMain.handle(Channels.windowMaximize, async () => {
    const w = opts.getWindow();
    if (!w) return;
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
  });
  ipcMain.handle(Channels.windowClose, async () => { opts.getWindow()?.close(); });

  opts.watcher.on("changed", (devices) => {
    const win = opts.getWindow();
    win?.webContents.send(Channels.devicesChanged, { devices });
  });

  opts.scrcpy.on("frame", (mirrorId: string, nal: Uint8Array, pts: number) => {
    opts.getWindow()?.webContents.send(Channels.mirrorFrame, { mirrorId, nal, pts });
  });
  opts.scrcpy.on("ended", (mirrorId: string, reason: string) => {
    opts.getWindow()?.webContents.send(Channels.mirrorEnded, { mirrorId, reason });
  });
}
