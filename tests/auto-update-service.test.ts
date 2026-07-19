import { describe, expect, it, vi } from "vitest";
import {
  type AppAutoUpdater,
  AutoUpdateService,
} from "../src/main/services/auto-update-service";

// A controllable stand-in for electron-updater's autoUpdater singleton so the
// service can be exercised without Electron or a real GitHub feed. The spies are
// returned alongside the updater to keep them free of AppAutoUpdater's method
// types (which an inline intersection would clash with).
function fakeUpdater() {
  const listeners = new Map<string, (payload: never) => void>();
  const checkForUpdates = vi.fn().mockResolvedValue(undefined);
  const quitAndInstall = vi.fn();
  const updater: AppAutoUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on(event: string, listener: (payload: never) => void) {
      listeners.set(event, listener);
      return updater;
    },
    checkForUpdates,
    quitAndInstall,
  };
  const emit = (event: string, payload: unknown) =>
    listeners.get(event)?.(payload as never);
  return { updater, checkForUpdates, quitAndInstall, emit };
}

describe("AutoUpdateService", () => {
  it("enables background download and checks for updates on start", () => {
    const { updater, checkForUpdates } = fakeUpdater();
    new AutoUpdateService(updater, vi.fn()).start();

    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(true);
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("surfaces the ready prompt only once a release has downloaded", () => {
    const { updater, emit } = fakeUpdater();
    const onReady = vi.fn();
    new AutoUpdateService(updater, onReady).start();

    expect(onReady).not.toHaveBeenCalled();
    emit("update-downloaded", { version: "0.2.0" });
    expect(onReady).toHaveBeenCalledWith({ version: "0.2.0" });
  });

  it("swallows feed errors so a broken update check never disrupts the app", async () => {
    const { updater, checkForUpdates, emit } = fakeUpdater();
    checkForUpdates.mockRejectedValueOnce(new Error("offline"));
    const service = new AutoUpdateService(updater, vi.fn());

    expect(() => service.start()).not.toThrow();
    // An emitted error must not throw either.
    expect(() => emit("error", new Error("bad feed"))).not.toThrow();
    await Promise.resolve();
  });

  it("only wires listeners once even if start is called repeatedly", () => {
    const { updater, checkForUpdates } = fakeUpdater();
    const service = new AutoUpdateService(updater, vi.fn());
    service.start();
    service.start();
    expect(checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("relaunches into the installer on install()", () => {
    const { updater, quitAndInstall } = fakeUpdater();
    new AutoUpdateService(updater, vi.fn()).install();
    expect(quitAndInstall).toHaveBeenCalledTimes(1);
  });
});
