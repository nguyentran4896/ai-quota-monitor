import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CLAUDE_QUOTA_SNAPSHOT_FILE } from "../providers/claude-statusline";
import type { ProviderProfile } from "./profile-store";
import {
  encodePowerShellCommand,
  quotePosix,
  quotePowerShellLiteral,
} from "./shell-quoting";

export interface ClaudeStatusLineCommandOptions {
  collectorPath: string;
  runtimePath: string;
  snapshotPath: string;
  platform: NodeJS.Platform;
}

export interface PrepareClaudeStatusLineOptions {
  collectorPath?: string;
  runtimePath?: string;
  platform?: NodeJS.Platform;
  homeDirectory?: string;
}

export function buildClaudeStatusLineCommand(
  options: ClaudeStatusLineCommandOptions,
): string {
  if (options.platform === "win32") {
    const script = [
      "$env:ELECTRON_RUN_AS_NODE = '1'",
      `& ${quotePowerShellLiteral(options.runtimePath)} ${quotePowerShellLiteral(options.collectorPath)} ${quotePowerShellLiteral(options.snapshotPath)}`,
    ].join("; ");
    return `powershell.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand ${encodePowerShellCommand(script)}`;
  }

  return [
    "ELECTRON_RUN_AS_NODE=1",
    quotePosix(options.runtimePath),
    quotePosix(options.collectorPath),
    quotePosix(options.snapshotPath),
  ].join(" ");
}

export async function prepareClaudeStatusLine(
  profile: ProviderProfile,
  options: PrepareClaudeStatusLineOptions,
): Promise<{ settingsPath: string | null; note: string | null }> {
  const quotaRoot = profile.quotaRoot ?? profile.configRoot;
  if (
    profile.provider !== "claude" ||
    !quotaRoot ||
    !options.collectorPath ||
    !options.runtimePath
  ) {
    return { settingsPath: null, note: null };
  }

  try {
    const providerSettingsRoot =
      profile.configRoot ??
      path.join(options.homeDirectory ?? os.homedir(), ".claude");
    const userSettings = JSON.parse(
      await readFile(path.join(providerSettingsRoot, "settings.json"), "utf8"),
    ) as Record<string, unknown>;
    if (userSettings.statusLine) {
      return {
        settingsPath: null,
        note: " Existing Claude status line preserved; QuotaDeck capture was not enabled.",
      };
    }
  } catch {
    // A missing or malformed optional user settings file does not block the launch layer.
  }

  await mkdir(quotaRoot, { recursive: true, mode: 0o700 });
  const settingsPath = path.join(quotaRoot, "quotadeck-launch-settings.json");
  const snapshotPath = path.join(quotaRoot, CLAUDE_QUOTA_SNAPSHOT_FILE);
  const command = buildClaudeStatusLineCommand({
    collectorPath: options.collectorPath,
    runtimePath: options.runtimePath,
    snapshotPath,
    platform: options.platform ?? process.platform,
  });
  const payload = {
    $schema: "https://json.schemastore.org/claude-code-settings.json",
    statusLine: { type: "command", command, padding: 1 },
  };
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, settingsPath);
  return {
    settingsPath,
    note: " Claude quota capture activates after the first response.",
  };
}
