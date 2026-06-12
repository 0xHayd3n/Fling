import { ipcMain, type BrowserWindow } from "electron";
import { Channels, type FlingConfig } from "./channels";
import type { DeviceWatcher } from "../deviceWatcher";
import { listDevices } from "@eleutex/fling/devices";

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
}) {
  ipcMain.handle(Channels.projectOpen, async () => null);
  ipcMain.handle(Channels.projectRecent, async () => []);
  ipcMain.handle(Channels.devicesList, async () => {
    const snap = opts.watcher.snapshot();
    return snap.length > 0 ? snap : await listDevices();
  });
  ipcMain.handle(Channels.deployRun, async () => ({ runId: "stub" }));
  ipcMain.handle(Channels.deployCancel, async () => ({ cancelled: false }));
  ipcMain.handle(Channels.mirrorStart, async () => ({ mirrorId: "stub", width: 1080, height: 1920 }));
  ipcMain.handle(Channels.mirrorStop, async () => ({}));
  ipcMain.handle(Channels.mirrorInput, async () => undefined);
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
}
