import type {
  ProviderCapabilities,
  RuntimePlatform,
} from "../shared/contracts";

export function describeRuntimePlatform(
  platform: NodeJS.Platform = process.platform,
): RuntimePlatform {
  if (platform === "win32")
    return { id: "windows", label: "Windows", shortcutModifier: "Ctrl" };
  if (platform === "darwin")
    return { id: "macos", label: "macOS", shortcutModifier: "⌘" };
  if (platform === "linux")
    return { id: "linux", label: "Linux", shortcutModifier: "Ctrl" };
  return { id: "unknown", label: platform, shortcutModifier: "Ctrl" };
}

export function describeProviderCapabilities(
  platform: NodeJS.Platform = process.platform,
): ProviderCapabilities {
  return {
    claude:
      platform === "darwin"
        ? {
            managedProfiles: false,
            reason:
              "Claude Code uses one macOS Keychain credential, so independent Claude profiles are not currently safe.",
          }
        : { managedProfiles: true, reason: null },
    codex: { managedProfiles: true, reason: null },
  };
}
