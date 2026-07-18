import type { ProviderId } from "../../shared/contracts";
import os from "node:os";
import path from "node:path";

const claudeBillingOverrides = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
] as const;

export interface ProfileEnvironmentContext {
  platform?: NodeJS.Platform;
  homeDirectory?: string;
}

function prependCliSearchPaths(
  environment: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homeDirectory: string,
): void {
  const isWindows = platform === "win32";
  const pathKey = isWindows
    ? (Object.keys(environment).find((key) => key.toLowerCase() === "path") ??
      "Path")
    : "PATH";
  const existing =
    environment[pathKey]?.split(isWindows ? ";" : ":").filter(Boolean) ?? [];
  let candidates: string[];

  if (isWindows) {
    const appData =
      environment.APPDATA ??
      path.win32.join(homeDirectory, "AppData", "Roaming");
    const localAppData =
      environment.LOCALAPPDATA ??
      path.win32.join(homeDirectory, "AppData", "Local");
    candidates = [
      path.win32.join(appData, "npm"),
      path.win32.join(localAppData, "pnpm"),
      path.win32.join(homeDirectory, ".local", "bin"),
    ];
  } else if (platform === "darwin") {
    candidates = [
      path.posix.join(homeDirectory, ".local", "bin"),
      path.posix.join(homeDirectory, "Library", "pnpm"),
      path.posix.join(homeDirectory, ".bun", "bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ];
  } else {
    candidates = [
      path.posix.join(homeDirectory, ".local", "bin"),
      path.posix.join(homeDirectory, ".local", "share", "pnpm"),
      path.posix.join(homeDirectory, ".bun", "bin"),
      "/usr/local/bin",
      "/usr/bin",
    ];
  }

  const comparisonKey = (value: string) =>
    isWindows ? value.toLowerCase() : value;
  const seen = new Set<string>();
  const combined = [...candidates, ...existing].filter((entry) => {
    const key = comparisonKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  environment[pathKey] = combined.join(isWindows ? ";" : ":");
}

export function createProfileEnvironment(
  provider: ProviderId,
  configRoot: string | null,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
  context: ProfileEnvironmentContext = {},
): NodeJS.ProcessEnv {
  const environment = { ...baseEnvironment };
  prependCliSearchPaths(
    environment,
    context.platform ?? process.platform,
    context.homeDirectory ?? os.homedir(),
  );
  if (!configRoot) return environment;

  if (provider === "claude") {
    environment.CLAUDE_CONFIG_DIR = configRoot;
    for (const variable of claudeBillingOverrides) delete environment[variable];
  } else {
    environment.CODEX_HOME = configRoot;
    delete environment.OPENAI_API_KEY;
  }
  return environment;
}
