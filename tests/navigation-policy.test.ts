import { describe, expect, it } from "vitest";
import { isAllowedRendererNavigation } from "../src/main/navigation-policy";

describe("renderer navigation policy", () => {
  it("allows only the exact packaged renderer document", () => {
    const rendererUrl =
      "file:///opt/QuotaDeck/resources/app.asar/dist/index.html";
    expect(isAllowedRendererNavigation(rendererUrl, rendererUrl, null)).toBe(
      true,
    );
    expect(
      isAllowedRendererNavigation(
        "file:///Users/dev/private.html",
        rendererUrl,
        null,
      ),
    ).toBe(false);
    expect(
      isAllowedRendererNavigation(
        `${rendererUrl}?upload=quota`,
        rendererUrl,
        null,
      ),
    ).toBe(false);
  });

  it("allows the configured development origin but not lookalike hosts", () => {
    const developmentUrl = "http://127.0.0.1:5173";
    expect(
      isAllowedRendererNavigation(
        "http://127.0.0.1:5173/src/renderer/main.tsx",
        "file:///unused/index.html",
        developmentUrl,
      ),
    ).toBe(true);
    expect(
      isAllowedRendererNavigation(
        "http://127.0.0.1:5173.evil.example/",
        "file:///unused/index.html",
        developmentUrl,
      ),
    ).toBe(false);
  });
});
