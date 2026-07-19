import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    main: "src/main/index.ts",
    preload: "src/preload/index.ts",
  },
  format: ["cjs"],
  outDir: "dist-electron",
  clean: true,
  sourcemap: true,
  external: ["electron"],
  // tsup externalizes package.json `dependencies` by default, but the packaged
  // app ships only dist/ + dist-electron/ (no node_modules — see the
  // electron-builder `files` list), so any main-process dependency must be
  // bundled into main.cjs to be resolvable at runtime.
  noExternal: ["electron-updater"],
  platform: "node",
  target: "node22",
});
