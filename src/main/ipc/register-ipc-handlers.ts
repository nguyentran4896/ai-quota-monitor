import { lstat } from "node:fs/promises";
import path from "node:path";
import {
  dialog,
  ipcMain,
  shell,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from "electron";
import type {
  AddProfileInput,
  AlertThreshold,
  ProfileActionResult,
  ProviderId,
} from "../../shared/contracts";
import { evaluateProfileLaunchSafety } from "../profiles/profile-launch-safety";
import { launchProfile } from "../profiles/profile-launcher";
import {
  logoutClaudeProfile,
  logoutManagedProfile,
} from "../profiles/profile-logout";
import type { ProfileStore } from "../profiles/profile-store";
import type { CodexMonitorManager } from "../providers/codex-app-server";
import { stopProviderSnapshotMonitoring } from "../providers/provider-adapters";
import { providerInstallUrl } from "../providers/provider-install";
import { providerUsageUrl } from "../providers/provider-usage";
import { createAsyncRequestCoalescer } from "../services/concurrency";
import {
  collectDashboard,
  collectProfileSnapshot,
} from "../services/dashboard";
import type { QuotaAlertService } from "../services/quota-alert-service";
import {
  isAlertThreshold,
  type AlertSettingsStore,
} from "../settings/alert-settings-store";
import { probeProviderCommand } from "../settings/cli-probe";
import type { CliSettingsStore } from "../settings/cli-settings-store";

interface RegisterIpcHandlersOptions {
  profileStore: ProfileStore;
  cliSettingsStore: CliSettingsStore;
  alertSettingsStore: AlertSettingsStore;
  quotaAlertService: QuotaAlertService;
  codexMonitor: CodexMonitorManager;
  claudeStatusLineCollectorPath: string;
  evidencePath: string;
  runtimePath: string;
  platform: NodeJS.Platform;
  identityKey: Uint8Array;
  getMainWindow: () => BrowserWindow;
  assertTrustedSender: (event: IpcMainInvokeEvent) => void;
}

function isProvider(value: unknown): value is ProviderId {
  return value === "claude" || value === "codex";
}

function providerName(provider: ProviderId): string {
  return provider === "claude" ? "Claude Code" : "Codex";
}

// A short, non-secret handle so confirmations name the exact profile even when
// legacy duplicate labels exist.
function profileHandle(provider: ProviderId, id: string): string {
  const shortId = id.includes("-") ? id.slice(0, 8) : id;
  return `${providerName(provider)} · ${shortId}`;
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function registerIpcHandlers({
  profileStore,
  cliSettingsStore,
  alertSettingsStore,
  quotaAlertService,
  codexMonitor,
  claudeStatusLineCollectorPath,
  evidencePath,
  runtimePath,
  platform,
  identityKey,
  getMainWindow,
  assertTrustedSender,
}: RegisterIpcHandlersOptions): void {
  const dashboardRequests = createAsyncRequestCoalescer(async () => {
    const threshold = await alertSettingsStore.getThreshold();
    const dashboard = await collectDashboard(
      profileStore,
      await cliSettingsStore.getCommands(),
      codexMonitor,
      identityKey,
      threshold,
    );
    quotaAlertService.evaluate(dashboard.accounts, threshold);
    return dashboard;
  });
  const getDashboard = () => dashboardRequests.run();

  ipcMain.handle("dashboard:get", (event) => {
    assertTrustedSender(event);
    return getDashboard();
  });
  ipcMain.handle("dashboard:refresh", (event) => {
    assertTrustedSender(event);
    return getDashboard();
  });
  ipcMain.handle("profiles:add", async (event, input: AddProfileInput) => {
    assertTrustedSender(event);
    await profileStore.create(input);
    dashboardRequests.invalidate();
    return getDashboard();
  });
  ipcMain.handle("profiles:remove", async (event, profileId: string) => {
    assertTrustedSender(event);
    const profile = await profileStore.get(profileId);
    if (!profile) {
      return { ok: false, message: "Account profile was not found." };
    }
    if (!profile.isManaged) {
      return {
        ok: false,
        message: "Current provider profiles cannot be removed.",
      };
    }

    const confirmation = await dialog.showMessageBox(getMainWindow(), {
      type: "warning",
      title: "Remove account profile?",
      message: `Remove ${profile.displayName} (${profileHandle(
        profile.provider,
        profile.id,
      )}) from QuotaDeck?`,
      detail:
        "Signing out asks the official provider client to revoke or remove its login first. The isolated provider home and local sessions are then moved to the system Trash or Recycle Bin.",
      buttons: [
        "Cancel",
        "Remove without provider logout",
        "Sign out and remove",
      ],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirmation.response === 0) {
      return { ok: false, message: "Profile removal was cancelled." };
    }

    const target = await profileStore.getRemovalTarget(profileId);
    if (confirmation.response === 2) {
      const commands = await cliSettingsStore.getCommands();
      const logout: ProfileActionResult = await logoutManagedProfile(
        target.profile,
        {
          logoutClaude: (configRoot) =>
            logoutClaudeProfile(configRoot, commands.claude),
          logoutCodex: (configRoot) =>
            codexMonitor.logoutProfile(configRoot, commands.codex),
        },
      );
      if (!logout.ok) return logout;
    }

    stopProviderSnapshotMonitoring(target.profile, {
      commands: await cliSettingsStore.getCommands(),
      codexMonitor,
    });

    let movedToTrash = false;
    try {
      if (await pathExists(target.profileDirectory)) {
        await shell.trashItem(target.profileDirectory);
        movedToTrash = true;
      }
      await profileStore.remove(profileId);
      dashboardRequests.invalidate();
      return {
        ok: true,
        message: movedToTrash
          ? `${target.profile.displayName} was moved to the system Trash or Recycle Bin.`
          : `${target.profile.displayName} was already absent on disk; its stale registration was removed.`,
      };
    } catch {
      return {
        ok: false,
        message: movedToTrash
          ? `${target.profile.displayName} was moved to Trash, but QuotaDeck could not update its profile registry. Restart QuotaDeck and remove the stale entry again.`
          : `${target.profile.displayName} could not be moved to Trash and remains registered in QuotaDeck.`,
      };
    }
  });
  ipcMain.handle(
    "profiles:rename",
    async (event, profileId: string, displayName: string) => {
      assertTrustedSender(event);
      const profile = await profileStore.get(profileId);
      if (!profile) {
        return { ok: false, message: "Account profile was not found." };
      }
      if (!profile.isManaged) {
        return {
          ok: false,
          message: "Current provider profiles cannot be renamed.",
        };
      }
      try {
        const updated = await profileStore.rename(profileId, displayName);
        dashboardRequests.invalidate();
        return { ok: true, message: `Renamed to ${updated.displayName}.` };
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "The account could not be renamed.",
        };
      }
    },
  );
  ipcMain.handle("profiles:login", async (event, profileId: string) => {
    assertTrustedSender(event);
    const profile = await profileStore.get(profileId);
    if (!profile) {
      return { ok: false, message: "Account profile was not found." };
    }
    const commands = await cliSettingsStore.getCommands();
    return launchProfile(profile, "login", {
      collectorPath: claudeStatusLineCollectorPath,
      runtimePath,
      command: commands[profile.provider],
    });
  });
  ipcMain.handle("profiles:launch", async (event, profileId: string) => {
    assertTrustedSender(event);
    const profile = await profileStore.get(profileId);
    if (!profile) {
      return { ok: false, message: "Account profile was not found." };
    }
    const commands = await cliSettingsStore.getCommands();
    const snapshot = await collectProfileSnapshot(
      profile,
      platform,
      commands,
      codexMonitor,
      identityKey,
    );
    const safety = evaluateProfileLaunchSafety(profile, snapshot);
    if (safety.kind === "block") {
      return { ok: false, message: safety.message };
    }
    if (safety.kind === "confirm") {
      const confirmation = await dialog.showMessageBox(getMainWindow(), {
        type: safety.confirmBilling ? "warning" : "question",
        title: safety.title,
        message: safety.message,
        detail: safety.detail,
        buttons: [
          "Cancel",
          safety.confirmBilling ? "Confirm and launch" : "Verify and launch",
        ],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) {
        return { ok: false, message: "Profile launch was cancelled." };
      }
      if (safety.verifyIdentity) {
        await profileStore.verifyIdentity(
          profile.id,
          safety.verifyIdentity.maskedIdentity,
          safety.verifyIdentity.verifier,
        );
        dashboardRequests.invalidate();
      }
    }
    return launchProfile(profile, "work", {
      collectorPath: claudeStatusLineCollectorPath,
      runtimePath,
      command: commands[profile.provider],
    });
  });
  ipcMain.handle("settings:choose-cli", async (event, provider: ProviderId) => {
    assertTrustedSender(event);
    if (!isProvider(provider)) {
      return { ok: false, message: "Unsupported provider." };
    }
    const selection = await dialog.showOpenDialog(getMainWindow(), {
      title: `Choose the ${providerName(provider)} executable`,
      properties: ["openFile"],
      // On Windows the CLI ships as an .exe or an npm/pnpm .cmd/.bat/.ps1 shim.
      // Offer those first, but keep "All files" so a shim without an extension
      // (or a non-Windows host) is still selectable.
      filters:
        process.platform === "win32"
          ? [
              {
                name: "Executables and shims",
                extensions: ["exe", "cmd", "bat", "ps1"],
              },
              { name: "All files", extensions: ["*"] },
            ]
          : undefined,
    });
    const executable = selection.filePaths[0];
    if (selection.canceled || !executable) {
      return { ok: false, message: "CLI selection was cancelled." };
    }
    const status = await probeProviderCommand(provider, executable, "custom");
    if (!status.callable || !status.compatible) {
      return { ok: false, message: status.message };
    }
    await cliSettingsStore.setCommand(provider, executable);
    codexMonitor.stopAll();
    dashboardRequests.invalidate();
    return {
      ok: true,
      message: `${providerName(provider)} executable saved for this device.`,
    };
  });
  ipcMain.handle("settings:reset-cli", async (event, provider: ProviderId) => {
    assertTrustedSender(event);
    if (!isProvider(provider)) {
      return { ok: false, message: "Unsupported provider." };
    }
    await cliSettingsStore.resetCommand(provider);
    codexMonitor.stopAll();
    dashboardRequests.invalidate();
    return {
      ok: true,
      message: `${providerName(provider)} will be discovered from the application PATH.`,
    };
  });
  ipcMain.handle(
    "settings:recheck-cli",
    async (event, provider: ProviderId) => {
      assertTrustedSender(event);
      if (!isProvider(provider)) {
        return { ok: false, message: "Unsupported provider." };
      }
      const commands = await cliSettingsStore.getCommands();
      const command = commands[provider];
      const status = await probeProviderCommand(
        provider,
        command,
        path.isAbsolute(command) ? "custom" : "path",
      );
      // Force the next dashboard read to re-probe rather than reuse a cached
      // result, so the card the user is looking at reflects this re-check.
      dashboardRequests.invalidate();
      // status.message is already a curated sentence — never raw command output.
      return {
        ok: status.callable && status.compatible,
        message: status.message,
      };
    },
  );
  ipcMain.handle(
    "settings:open-install",
    async (event, provider: ProviderId) => {
      assertTrustedSender(event);
      if (!isProvider(provider)) {
        return { ok: false, message: "Unsupported provider." };
      }
      try {
        await shell.openExternal(providerInstallUrl(provider));
        return {
          ok: true,
          message: `${providerName(provider)} install instructions opened in your browser.`,
        };
      } catch {
        return {
          ok: false,
          message: `${providerName(provider)} install instructions could not be opened.`,
        };
      }
    },
  );
  ipcMain.handle(
    "settings:set-alert-threshold",
    async (event, threshold: AlertThreshold) => {
      assertTrustedSender(event);
      if (!isAlertThreshold(threshold)) {
        return { ok: false, message: "Unsupported alert threshold." };
      }
      await alertSettingsStore.setThreshold(threshold);
      dashboardRequests.invalidate();
      return {
        ok: true,
        message:
          threshold === null
            ? "Local quota alerts are off."
            : `Local quota alerts will appear at ${threshold}% used.`,
      };
    },
  );
  ipcMain.handle("usage:open", async (event, provider: ProviderId) => {
    assertTrustedSender(event);
    if (!isProvider(provider)) {
      return { ok: false, message: "Unsupported provider." };
    }
    try {
      await shell.openExternal(providerUsageUrl(provider));
      return {
        ok: true,
        message: `${providerName(provider)} usage instructions opened in your browser.`,
      };
    } catch {
      return {
        ok: false,
        message: `${providerName(provider)} usage instructions could not be opened.`,
      };
    }
  });
  ipcMain.handle("evidence:open", async (event) => {
    assertTrustedSender(event);
    const error = await shell.openPath(evidencePath);
    return error
      ? {
          ok: false,
          message: `The research report could not be opened: ${error}`,
        }
      : {
          ok: true,
          message: "Provider research opened in your default Markdown app.",
        };
  });
}
