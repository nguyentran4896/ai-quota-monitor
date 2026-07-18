import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import type { ProfileActionResult } from "../../shared/contracts";
import type { ProviderProfile } from "./profile-store";
import { createProfileEnvironment } from "./profile-environment";
import { CLAUDE_QUOTA_SNAPSHOT_FILE } from "../providers/claude-statusline";

export type ProfileAction = "login" | "work";
const execFileAsync = promisify(execFile);

export interface ProfileLaunchSpec {
  executable: "claude" | "codex";
  args: string[];
  environment: NodeJS.ProcessEnv;
  title: string;
}

export interface ProfileLauncherOptions {
  claudeStatusLineScriptPath?: string;
}

export function createProfileLaunchSpec(
  profile: ProviderProfile,
  action: ProfileAction,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
  claudeSettingsPath?: string | null,
): ProfileLaunchSpec {
  const executable = profile.provider === "claude" ? "claude" : "codex";
  const args =
    action === "work"
      ? profile.provider === "claude" && claudeSettingsPath
        ? ["--settings", claudeSettingsPath]
        : []
      : profile.provider === "claude"
        ? ["auth", "login", "--claudeai"]
        : ["login"];
  const environment = createProfileEnvironment(profile.provider, profile.configRoot, baseEnvironment);

  return {
    executable,
    args,
    environment,
    title: `QuotaDeck - ${profile.displayName}`,
  };
}

function quotePowerShellArgument(value: string): string {
  return `"${value.replaceAll("\\", "/")}"`;
}

export async function prepareClaudeStatusLine(
  profile: ProviderProfile,
  scriptPath: string | undefined,
): Promise<{ settingsPath: string | null; note: string | null }> {
  if (profile.provider !== "claude" || !profile.configRoot || !scriptPath) {
    return { settingsPath: null, note: null };
  }

  try {
    const userSettings = JSON.parse(await readFile(path.join(profile.configRoot, "settings.json"), "utf8")) as Record<string, unknown>;
    if (userSettings.statusLine) {
      return { settingsPath: null, note: " Existing Claude status line preserved; QuotaDeck capture was not enabled." };
    }
  } catch {
    // A missing or malformed optional user settings file does not block the isolated launch settings.
  }

  await mkdir(profile.configRoot, { recursive: true, mode: 0o700 });
  const settingsPath = path.join(profile.configRoot, "quotadeck-launch-settings.json");
  const snapshotPath = path.join(profile.configRoot, CLAUDE_QUOTA_SNAPSHOT_FILE);
  const command = [
    "powershell",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    quotePowerShellArgument(scriptPath),
    "-OutputPath",
    quotePowerShellArgument(snapshotPath),
  ].join(" ");
  const payload = {
    $schema: "https://json.schemastore.org/claude-code-settings.json",
    statusLine: { type: "command", command, padding: 1 },
  };
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, settingsPath);
  return { settingsPath, note: " Claude quota capture activates after the first response." };
}

export async function launchProfile(
  profile: ProviderProfile,
  action: ProfileAction,
  options: ProfileLauncherOptions = {},
): Promise<ProfileActionResult> {
  if (process.platform !== "win32") {
    return { ok: false, message: "Profile launch is currently implemented for Windows only." };
  }

  const statusLine = action === "work"
    ? await prepareClaudeStatusLine(profile, options.claudeStatusLineScriptPath)
    : { settingsPath: null, note: null };
  const spec = createProfileLaunchSpec(profile, action, process.env, statusLine.settingsPath);
  try {
    await execFileAsync(spec.executable, ["--version"], {
      env: spec.environment,
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 64_000,
    });
  } catch {
    const providerName = profile.provider === "claude" ? "Claude Code" : "Codex";
    return {
      ok: false,
      message: `${providerName} is installed but not callable as a standalone CLI. Install or repair its official CLI before launching this profile.`,
    };
  }
  return new Promise((resolve) => {
    const child = spawn(
      "wt.exe",
      ["new-tab", "--startingDirectory", os.homedir(), "--title", spec.title, spec.executable, ...spec.args],
      {
        env: spec.environment,
        detached: true,
        stdio: "ignore",
        windowsHide: false,
        shell: false,
      },
    );
    let settled = false;
    const finish = (result: ProfileActionResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.once("error", () => finish({ ok: false, message: "Windows Terminal or the provider CLI could not be started." }));
    child.once("spawn", () => {
      child.unref();
      finish({
        ok: true,
        message: action === "login"
          ? "Official provider login opened in a new terminal."
          : `Account workspace opened in a new terminal.${statusLine.note ?? ""}`,
      });
    });
  });
}
