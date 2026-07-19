import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripDevCsp } from "../vite.config";

const indexHtml = readFileSync(
  path.resolve(import.meta.dirname, "..", "index.html"),
  "utf8",
);

function transform(html: string): string {
  const plugin = stripDevCsp();
  const hook = plugin.transformIndexHtml;
  if (typeof hook !== "function") {
    throw new Error("expected transformIndexHtml to be a function hook");
  }
  const result = hook.call(plugin as never, html, {} as never);
  if (typeof result !== "string") {
    throw new Error("expected the html transform to return a string");
  }
  return result;
}

describe("renderer CSP build transform", () => {
  it("only applies during production builds", () => {
    expect(stripDevCsp().apply).toBe("build");
  });

  it("removes the dev-only loopback websocket from connect-src", () => {
    expect(indexHtml).toContain("ws://127.0.0.1:*");
    const built = transform(indexHtml);
    expect(built).not.toContain("ws://127.0.0.1");
    expect(built).toContain("connect-src 'self';");
  });

  it("leaves other CSP directives untouched", () => {
    const built = transform(indexHtml);
    expect(built).toContain("default-src 'self'");
    expect(built).toContain("object-src 'none'");
    expect(built).toContain("frame-src 'none'");
  });
});
