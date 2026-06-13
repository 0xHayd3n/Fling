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
    minWidth: 480,
    minHeight: 360,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#181a1f",
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
app.on("before-quit", async () => {
  watcher?.stop();
  for (const s of scrcpy?.active() ?? []) await s.stop();
});
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
