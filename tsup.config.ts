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
  platform: "node",
  target: "node22",
});

