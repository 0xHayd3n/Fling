import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "Fling Desktop",
    // scrcpy-server.jar must live OUTSIDE the asar — `adb push` spawns a
    // separate OS process that cannot read into asar archives. extraResource
    // places it under process.resourcesPath/ in the packaged app, which is
    // what scrcpyClient.ts reads when app.isPackaged is true.
    extraResource: ["resources/scrcpy-server.jar", "resources/NOTICE"],
  },
  makers: [new MakerSquirrel({}), new MakerZIP({}, ["darwin", "linux"])],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main/index.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "src/preload/index.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
  ],
};

export default config;
