import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// The renderer CSP in index.html keeps `ws://127.0.0.1:*` in `connect-src` so
// that Vite's dev-server HMR websocket works. That loopback source is only
// needed in development, so strip it from the CSP when building for production.
export function stripDevCsp(): Plugin {
  return {
    name: "strip-dev-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(/\s*ws:\/\/127\.0\.0\.1:\*/g, "");
    },
  };
}

export default defineConfig({
  plugins: [react(), stripDevCsp()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
