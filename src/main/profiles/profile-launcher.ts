import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { ProfileActionResult } from "../../shared/contracts";
import type { ProviderProfile } from "./profile-store";
import { createProfileEnvironment } from "./profile-environment";

export type ProfileAction = "login" | "work";
const execFileAsync = promisify(execFile);

export interface ProfileLaunchSpec {
  executable: "claude" | "codex";
  args: string[];
  environment: NodeJS.ProcessEnv;
  title: string;
}

export function createProfileLaunchSpec(
  profile: ProviderProfile,
  action: ProfileAction,
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): ProfileLaunchSpec {
  const executable = profile.provider === "claude" ? "claude" : "codex";
  const args =
    action === "work"
      ? []
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

export async function launchProfile(
  profile: ProviderProfile,
  action: ProfileAction,
): Promise<ProfileActionResult> {
  if (process.platform !== "win32") {
    return { ok: false, message: "Profile launch is currently implemented for Windows only." };
  }

  const spec = createProfileLaunchSpec(profile, action);
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
      ["new-tab", "--title", spec.title, spec.executable, ...spec.args],
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
        message: action === "login" ? "Official provider login opened in a new terminal." : "Account workspace opened in a new terminal.",
      });
    });
  });
}
