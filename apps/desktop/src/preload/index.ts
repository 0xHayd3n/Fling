import { contextBridge, ipcRenderer } from "electron";
import { Channels } from "../main/ipc/channels";

type Listener = (...args: unknown[]) => void;
const onChannel = (channel: string, cb: Listener) => {
  const wrapped = (_evt: unknown, payload: unknown) => cb(payload as never);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.off(channel, wrapped);
};

contextBridge.exposeInMainWorld("fling", {
  version: "0.5.1",
  project: {
    open: () => ipcRenderer.invoke(Channels.projectOpen),
    recent: () => ipcRenderer.invoke(Channels.projectRecent),
  },
  devices: { list: () => ipcRenderer.invoke(Channels.devicesList) },
  deploy: {
    run: (req: unknown) => ipcRenderer.invoke(Channels.deployRun, req),
    cancel: (req: unknown) => ipcRenderer.invoke(Channels.deployCancel, req),
  },
  mirror: {
    start: (req: unknown) => ipcRenderer.invoke(Channels.mirrorStart, req),
    stop: (req: unknown) => ipcRenderer.invoke(Channels.mirrorStop, req),
    input: (req: unknown) => ipcRenderer.invoke(Channels.mirrorInput, req),
  },
  pairing: { start: (req: unknown) => ipcRenderer.invoke(Channels.pairingStart, req) },
  config: {
    read: () => ipcRenderer.invoke(Channels.configRead),
    write: (patch: unknown) => ipcRenderer.invoke(Channels.configWrite, patch),
  },
  window: {
    minimize: () => ipcRenderer.invoke(Channels.windowMinimize),
    maximize: () => ipcRenderer.invoke(Channels.windowMaximize),
    close: () => ipcRenderer.invoke(Channels.windowClose),
    setAlwaysOnTop: (pinned: boolean) => ipcRenderer.invoke(Channels.windowSetAlwaysOnTop, pinned),
    setOpacity: (opacity: number) => ipcRenderer.invoke(Channels.windowSetOpacity, opacity),
    getBounds: () => ipcRenderer.invoke(Channels.windowGetBounds),
    setBounds: (bounds: unknown) => ipcRenderer.invoke(Channels.windowSetBounds, bounds),
  },
  on: {
    devicesChanged: (cb: Listener) => onChannel(Channels.devicesChanged, cb),
    adbProbe: (cb: Listener) => onChannel(Channels.adbProbe, cb),
    deployStarted: (cb: Listener) => onChannel(Channels.deployStarted, cb),
    deployDone: (cb: Listener) => onChannel(Channels.deployDone, cb),
    mirrorFrame: (cb: Listener) => onChannel(Channels.mirrorFrame, cb),
    mirrorResize: (cb: Listener) => onChannel(Channels.mirrorResize, cb),
    mirrorEnded: (cb: Listener) => onChannel(Channels.mirrorEnded, cb),
  },
});
