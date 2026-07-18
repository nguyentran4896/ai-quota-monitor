import { describe, expect, it } from "vitest";
import {
  describeProviderCapabilities,
  describeRuntimePlatform,
} from "../src/main/platform";
import { createProfileEnvironment } from "../src/main/profiles/profile-environment";

describe("desktop platform support", () => {
  it.each([
    ["win32", { id: "windows", label: "Windows", shortcutModifier: "Ctrl" }],
    ["darwin", { id: "macos", label: "macOS", shortcutModifier: "⌘" }],
    ["linux", { id: "linux", label: "Linux", shortcutModifier: "Ctrl" }],
  ] as const)("describes %s for the renderer", (platform, expected) => {
    expect(describeRuntimePlatform(platform)).toEqual(expected);
  });

  it("adds common macOS GUI CLI locations without dropping the existing PATH", () => {
    const environment = createProfileEnvironment(
      "claude",
      "/Users/dev/Library/Application Support/QuotaDeck/claude-home",
      { PATH: "/usr/bin:/bin", ANTHROPIC_API_KEY: "must-not-leak" },
      { platform: "darwin", homeDirectory: "/Users/dev" },
    );
    expect(environment.PATH?.split(":")).toEqual([
      "/Users/dev/.local/bin",
      "/Users/dev/Library/pnpm",
      "/Users/dev/.bun/bin",
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
    ]);
    expect(environment.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it("preserves the Windows Path key while adding package-manager CLI locations", () => {
    const environment = createProfileEnvironment(
      "codex",
      "C:\\Users\\dev\\AppData\\Roaming\\QuotaDeck\\codex-home",
      {
        Path: "C:\\Windows\\System32",
        APPDATA: "C:\\Users\\dev\\AppData\\Roaming",
        LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local",
        OPENAI_API_KEY: "must-not-leak",
      },
      { platform: "win32", homeDirectory: "C:\\Users\\dev" },
    );
    expect(environment.PATH).toBeUndefined();
    expect(environment.Path?.split(";")).toEqual([
      "C:\\Users\\dev\\AppData\\Roaming\\npm",
      "C:\\Users\\dev\\AppData\\Local\\pnpm",
      "C:\\Users\\dev\\.local\\bin",
      "C:\\Windows\\System32",
    ]);
    expect(environment.OPENAI_API_KEY).toBeUndefined();
  });

  it("blocks unsafe managed Claude profiles only where credentials are global", () => {
    expect(describeProviderCapabilities("darwin")).toEqual({
      claude: {
        managedProfiles: false,
        reason:
          "Claude Code uses one macOS Keychain credential, so independent Claude profiles are not currently safe.",
      },
      codex: { managedProfiles: true, reason: null },
    });
    expect(describeProviderCapabilities("win32").claude.managedProfiles).toBe(
      true,
    );
    expect(describeProviderCapabilities("linux").claude.managedProfiles).toBe(
      true,
    );
  });
});
