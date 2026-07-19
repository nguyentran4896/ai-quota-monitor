import {
  app,
  BrowserWindow,
  type IpcMainInvokeEvent,
  Menu,
  nativeImage,
  Notification,
  Tray,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerIpcHandlers } from "./ipc/register-ipc-handlers";
import {
  isTrustedRendererUrl,
  selectDevelopmentRendererUrl,
} from "./navigation-policy";
import { ProfileStore } from "./profiles/profile-store";
import { CodexMonitorManager } from "./providers/codex-app-server";
import { QuotaAlertService } from "./services/quota-alert-service";
import { AlertSettingsStore } from "./settings/alert-settings-store";
import { CliSettingsStore } from "./settings/cli-settings-store";
import { IdentityKeyStore } from "./settings/identity-key-store";

const rendererFilePath = path.join(__dirname, "../dist/index.html");
const rendererFileUrl = pathToFileURL(rendererFilePath).href;
const developmentServerUrl = selectDevelopmentRendererUrl(
  app.isPackaged,
  process.env.VITE_DEV_SERVER_URL,
);
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let codexMonitor: CodexMonitorManager | null = null;

function resourcePath(fileName: string, developmentPath: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, fileName)
    : path.join(app.getAppPath(), developmentPath);
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  // Window Controls Overlay is Windows/macOS-only. On Linux it is a no-op, so a
  // hidden title bar would leave the window with no controls and no in-app ones.
  // Keep the custom title bar on macOS/Windows and use the native frame on Linux.
  const isWindows = process.platform === "win32";
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    show: false,
    backgroundColor: "#f4f2ec",
    titleBarStyle: isMac ? "hiddenInset" : isWindows ? "hidden" : "default",
    ...(isWindows && {
      titleBarOverlay: {
        color: "#f3f1eb",
        symbolColor: "#1d2a27",
        height: 40,
      },
    }),
    autoHideMenuBar: !isMac,
    icon: resourcePath("icon.png", path.join("build", "icon.png")),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    const canRemainReachable = tray !== null || isMac;
    if (!isQuitting && canRemainReachable) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url, rendererFileUrl, developmentServerUrl)) {
      event.preventDefault();
    }
  });
  window.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );

  if (developmentServerUrl) {
    void window.loadURL(developmentServerUrl);
  } else {
    void window.loadFile(rendererFilePath);
  }
  return window;
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? event.sender.getURL();
  if (!isTrustedRendererUrl(senderUrl, rendererFileUrl, developmentServerUrl)) {
    throw new Error("Blocked IPC request from an untrusted renderer.");
  }
}

function getMainWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  return mainWindow;
}

function showMainWindow(): void {
  const window = getMainWindow();
  window.show();
  window.focus();
}

function configureApplicationMenu(): void {
  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
    return;
  }

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { role: "editMenu" },
      { role: "windowMenu" },
    ]),
  );
}

function createTray(): void {
  try {
    const iconPath = resourcePath("icon.png", path.join("build", "icon.png"));
    const icon = nativeImage
      .createFromPath(iconPath)
      .resize({ width: 20, height: 20 });
    if (process.platform === "darwin") icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip("QuotaDeck - AI quota monitor");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Show QuotaDeck", click: showMainWindow },
        { type: "separator" },
        {
          label: "Quit",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ]),
    );
    tray.on("click", showMainWindow);
  } catch {
    tray = null;
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (app.isReady()) showMainWindow();
  });
  app.whenReady().then(async () => {
    if (process.platform === "win32") {
      app.setAppUserModelId("io.github.nguyentran4896.quotadeck");
    }
    configureApplicationMenu();

    const profileStore = new ProfileStore(
      app.getPath("userData"),
      process.platform,
    );
    const cliSettingsStore = new CliSettingsStore(app.getPath("userData"));
    const alertSettingsStore = new AlertSettingsStore(app.getPath("userData"));
    const quotaAlertService = new QuotaAlertService(({ title, body }) => {
      if (Notification.isSupported()) new Notification({ title, body }).show();
    });
    const identityKey = await new IdentityKeyStore(
      app.getPath("userData"),
    ).getKey();
    const activeCodexMonitor = new CodexMonitorManager();
    codexMonitor = activeCodexMonitor;

    registerIpcHandlers({
      profileStore,
      cliSettingsStore,
      alertSettingsStore,
      quotaAlertService,
      codexMonitor: activeCodexMonitor,
      claudeStatusLineCollectorPath: resourcePath(
        "claude-statusline.cjs",
        path.join("resources", "claude-statusline.cjs"),
      ),
      evidencePath: resourcePath(
        "provider-research.md",
        path.join("docs", "research", "provider-quota-and-auth.md"),
      ),
      runtimePath: process.execPath,
      platform: process.platform,
      identityKey,
      getMainWindow,
      assertTrustedSender: assertTrustedIpcSender,
    });

    mainWindow = createWindow();
    createTray();
    app.on("activate", showMainWindow);
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && tray === null) app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
  codexMonitor?.stopAll();
});
