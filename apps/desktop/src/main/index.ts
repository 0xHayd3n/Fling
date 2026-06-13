import { app, BrowserWindow, Menu } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "./ipc/handlers";
import { createDeviceWatcher } from "./deviceWatcher";
import { createScrcpyManager } from "./scrcpyClient";
import { attemptReconnect } from "./autoReconnect";
import { phoneShapedBounds, DEFAULT_PHONE_ASPECT } from "./windowSizing";

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
      // electron-forge VitePlugin emits the preload as <entry-basename>.js,
      // i.e. src/preload/index.ts -> .vite/build/index.js. If you rename
      // the preload entry in forge.config.ts, update this path.
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

  mainWindow.once("ready-to-show", () => {
    // Size the window to a 9:16 phone shape on first paint so the no-phone
    // hero card lives inside a phone-shaped shell instead of a wide desktop
    // window with empty bands of transparent space on either side. Once a
    // phone connects, mirror.start overrides this with the device's real
    // aspect.
    if (mainWindow) {
      const { width, height } = phoneShapedBounds(mainWindow, DEFAULT_PHONE_ASPECT);
      const b = mainWindow.getBounds();
      mainWindow.setBounds({ ...b, width, height });
    }
    mainWindow?.show();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  watcher = createDeviceWatcher();
  scrcpy = createScrcpyManager();
  registerIpcHandlers({ watcher, getWindow: () => mainWindow, scrcpy });
  createWindow();
  watcher.start();
  // Auto-reconnect known wireless devices in the background. Fires and forgets;
  // successful reconnects emit a pairingStatus event that the renderer toasts.
  void attemptReconnect(() => mainWindow);
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
    await scrcpy?.shutdown();
  })();
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 3000));
  void Promise.race([cleanup, timeout]).then(() => app.exit(0));
});

app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
