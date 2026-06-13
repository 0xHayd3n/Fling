import { ipcMain, screen, type BrowserWindow } from "electron";
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

  // App layout vertical: padding + toolbar + gap + canvas + padding.
  // App layout horizontal: padding + canvas + padding.
  // Toolbar is box-sizing: border-box, exactly 64px including the 1px borders.
  // Must match Toolbar.module.css .toolbar height.
  const TOOLBAR_HEIGHT = 64;
  const APP_PADDING = 8;
  const TOOLBAR_CANVAS_GAP = 8;
  const TOOLBAR_MIN_WIDTH = 320;
  const TARGET_WINDOW_HEIGHT = 800;
  const EXTRA_W = APP_PADDING * 2;
  const EXTRA_H = APP_PADDING * 2 + TOOLBAR_HEIGHT + TOOLBAR_CANVAS_GAP;

  ipcMain.handle(Channels.mirrorStart, async (_e, req: MirrorStartReq) => {
    const sess = await opts.scrcpy.start(req.deviceId, {
      maxResolution: req.maxResolution,
      bitrate: req.bitrate,
    });
    try {
      const win = opts.getWindow();
      if (win && sess.width > 0 && sess.height > 0) {
        const aspect = sess.width / sess.height;
        win.setAspectRatio(aspect, { width: EXTRA_W, height: EXTRA_H });
        const display = screen.getDisplayMatching(win.getBounds());
        const maxH = Math.floor(display.workAreaSize.height * 0.85);
        const targetH = Math.min(TARGET_WINDOW_HEIGHT, maxH);
        const canvasH = Math.max(1, targetH - EXTRA_H);
        const canvasW = Math.ceil(canvasH * aspect);
        let finalW = canvasW + EXTRA_W;
        let finalH = targetH;
        if (finalW < TOOLBAR_MIN_WIDTH) {
          finalW = TOOLBAR_MIN_WIDTH;
          const adjustedCanvasW = TOOLBAR_MIN_WIDTH - EXTRA_W;
          finalH = Math.ceil(adjustedCanvasW / aspect) + EXTRA_H;
        }
        const b = win.getBounds();
        win.setBounds({ ...b, width: finalW, height: finalH });
      }
    } catch (err) {
      process.stderr.write(`[handlers] aspect-lock failed: ${err instanceof Error ? err.message : String(err)}\n`);
    }
    const toArrayBuffer = (u8: Uint8Array): ArrayBuffer =>
      u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
    return {
      mirrorId: sess.mirrorId,
      width: sess.width,
      height: sess.height,
      configNal: toArrayBuffer(sess.configNal),
      firstKeyNal: toArrayBuffer(sess.firstKeyNal),
      firstKeyPts: sess.firstKeyPts,
    };
  });
  ipcMain.handle(Channels.mirrorStop, async (_e, req: MirrorStopReq) => {
    await opts.scrcpy.stop(req.mirrorId);
    try { opts.getWindow()?.setAspectRatio(0, { width: 0, height: 0 }); } catch {}
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

  opts.scrcpy.on("frame", (mirrorId: string, nal: Uint8Array, pts: number, isConfig: boolean, isKey: boolean) => {
    opts.getWindow()?.webContents.send(Channels.mirrorFrame, { mirrorId, nal, pts, isConfig, isKey });
  });
  opts.scrcpy.on("ended", (mirrorId: string, reason: string) => {
    opts.getWindow()?.webContents.send(Channels.mirrorEnded, { mirrorId, reason });
  });
}
