import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "./ipc/handlers";
import { createDeviceWatcher } from "./deviceWatcher";
import { createScrcpyManager } from "./scrcpyClient";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let watcher: ReturnType<typeof createDeviceWatcher> | null = null;
let scrcpy: ReturnType<typeof createScrcpyManager> | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 540,
    minWidth: 320,
    minHeight: 360,
    frame: false,
    titleBarStyle: "hidden",
    transparent: true,
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "index.js"),
    },
  });

  if (process.platform !== "darwin") Menu.setApplicationMenu(null);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  watcher = createDeviceWatcher();
  scrcpy = createScrcpyManager();
  registerIpcHandlers({ watcher, getWindow: () => mainWindow, scrcpy });
  createWindow();
  watcher.start();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// Electron doesn't await async `before-quit` handlers — it quits the moment the
// synchronous part returns. To actually wait for scrcpy processes to die we have
// to preventDefault, run cleanup, then app.exit(). A hard timeout guards against
// hung sessions blocking quit forever.
let quitting = false;
app.on("before-quit", (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  const cleanup = (async () => {
    watcher?.stop();
    const active = scrcpy?.active() ?? [];
    await Promise.allSettled(active.map((s) => s.stop()));
  })();
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  void Promise.race([cleanup, timeout]).then(() => app.exit(0));
});

app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
