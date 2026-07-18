import { describe, expect, it } from "vitest";
import {
  isTrustedRendererUrl,
  selectDevelopmentRendererUrl,
} from "../src/main/navigation-policy";

describe("renderer navigation policy", () => {
  it("allows only the exact packaged renderer document", () => {
    const rendererUrl =
      "file:///opt/QuotaDeck/resources/app.asar/dist/index.html";
    expect(isTrustedRendererUrl(rendererUrl, rendererUrl, null)).toBe(true);
    expect(
      isTrustedRendererUrl("file:///Users/dev/private.html", rendererUrl, null),
    ).toBe(false);
    expect(
      isTrustedRendererUrl(`${rendererUrl}?upload=quota`, rendererUrl, null),
    ).toBe(false);
  });

  it("allows the configured development origin but not lookalike hosts", () => {
    const developmentUrl = "http://127.0.0.1:5173";
    expect(
      isTrustedRendererUrl(
        "http://127.0.0.1:5173/src/renderer/main.tsx",
        "file:///unused/index.html",
        developmentUrl,
      ),
    ).toBe(true);
    expect(
      isTrustedRendererUrl(
        "http://127.0.0.1:5173.evil.example/",
        "file:///unused/index.html",
        developmentUrl,
      ),
    ).toBe(false);
  });

  it("never enables a development renderer in a packaged application", () => {
    expect(
      selectDevelopmentRendererUrl(true, "http://127.0.0.1:5173"),
    ).toBeNull();
  });

  it("accepts only loopback development servers in an unpackaged application", () => {
    expect(selectDevelopmentRendererUrl(false, "http://127.0.0.1:5173")).toBe(
      "http://127.0.0.1:5173/",
    );
    expect(selectDevelopmentRendererUrl(false, "http://localhost:5173")).toBe(
      "http://localhost:5173/",
    );
    expect(selectDevelopmentRendererUrl(false, "http://[::1]:5173")).toBe(
      "http://[::1]:5173/",
    );
    expect(
      selectDevelopmentRendererUrl(false, "https://quota.example"),
    ).toBeNull();
    expect(
      selectDevelopmentRendererUrl(false, "http://127.0.0.1.evil.test"),
    ).toBeNull();
  });

  it("authorizes IPC only from the same trusted renderer boundary", () => {
    const packagedRenderer =
      "file:///opt/QuotaDeck/resources/app.asar/dist/index.html";
    expect(isTrustedRendererUrl(packagedRenderer, packagedRenderer, null)).toBe(
      true,
    );
    expect(
      isTrustedRendererUrl("https://attacker.example/", packagedRenderer, null),
    ).toBe(false);
    expect(
      isTrustedRendererUrl(
        "http://localhost:5173/settings",
        packagedRenderer,
        "http://localhost:5173/",
      ),
    ).toBe(true);
  });
});
