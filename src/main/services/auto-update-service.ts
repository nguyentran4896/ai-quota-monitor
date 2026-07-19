import type { UpdateReadyInfo } from "../../shared/contracts";

// The minimal slice of electron-updater's `autoUpdater` this service drives.
// Declaring it locally keeps the service electron-free and unit-testable —
// `src/main/index.ts` injects the real singleton. The updater's ONLY network
// egress is to the GitHub Releases feed to read the latest version and download
// the signed installer; it never transmits account identities, tokens, quota
// data, or local filesystem paths, preserving the app's local-first posture.
export interface AppAutoUpdater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(
    event: "update-downloaded",
    listener: (info: { version: string }) => void,
  ): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

// Checks for updates once on launch, downloads any newer signed release in the
// background, and surfaces a single "Restart to install" prompt only once the
// download has completed. Update failures (offline, no release yet, unreadable
// feed) are deliberately swallowed: a broken or empty feed must never crash the
// app or nag the user — the check simply retries on the next launch.
export class AutoUpdateService {
  readonly #updater: AppAutoUpdater;
  readonly #onReady: (info: UpdateReadyInfo) => void;
  #started = false;

  constructor(
    updater: AppAutoUpdater,
    onReady: (info: UpdateReadyInfo) => void,
  ) {
    this.#updater = updater;
    this.#onReady = onReady;
  }

  start(): void {
    if (this.#started) return;
    this.#started = true;
    this.#updater.autoDownload = true;
    this.#updater.autoInstallOnAppQuit = true;
    this.#updater.on("update-downloaded", (info) =>
      this.#onReady({ version: info.version }),
    );
    this.#updater.on("error", () => {
      // Best-effort: ignore feed/network errors so update checks are silent.
    });
    void this.#updater.checkForUpdates().catch(() => {
      // Same rationale as the error listener, for the promise-rejection path.
    });
  }

  // Applies the already-downloaded update by relaunching into the installer.
  // Invoked from the renderer's "Restart to install" action.
  install(): void {
    this.#updater.quitAndInstall();
  }
}
