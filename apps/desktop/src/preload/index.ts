import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("fling", {
  version: "0.5.1",
});
