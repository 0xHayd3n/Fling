import { ipcMain } from "electron";
import { Channels } from "./channels";
import type { FlingConfig } from "./channels";

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

export function registerIpcHandlers() {
  ipcMain.handle(Channels.projectOpen, async () => null);
  ipcMain.handle(Channels.projectRecent, async () => []);
  ipcMain.handle(Channels.devicesList, async () => []);
  ipcMain.handle(Channels.deployRun, async () => ({ runId: "stub" }));
  ipcMain.handle(Channels.deployCancel, async () => ({ cancelled: false }));
  ipcMain.handle(Channels.mirrorStart, async () => ({ mirrorId: "stub", width: 1080, height: 1920 }));
  ipcMain.handle(Channels.mirrorStop, async () => ({}));
  ipcMain.handle(Channels.mirrorInput, async () => undefined);
  ipcMain.handle(Channels.pairingStart, async () => ({ paired: true }));
  ipcMain.handle(Channels.configRead, async () => DEFAULT_CONFIG);
  ipcMain.handle(Channels.configWrite, async () => ({ written: true }));
}
