import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    maxWorkers: 2,
    // Process-spawning tests (PowerShell doctor, cmd.exe shell boundary) carry
    // 15s inner exec timeouts; cold CI runners exceed vitest's 5s default.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
    },
  },
});
