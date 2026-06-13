import { defineConfig } from "vite";

// NOTE: electron-forge's VitePlugin ignores `lib.fileName` and `lib.entry` for
// the preload target. It always names the output after the entry file's
// basename (configured in forge.config.ts), so the emitted file is index.js,
// NOT preload.cjs. The format override below IS respected.
// If you rename the entry in forge.config.ts, update the preload path in
// main/index.ts.
export default defineConfig({
  build: {
    lib: { entry: "src/preload/index.ts", formats: ["cjs"] },
    rollupOptions: { external: ["electron", /^node:/] },
  },
});
