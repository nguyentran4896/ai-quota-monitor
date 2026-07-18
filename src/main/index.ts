import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  Menu,
  nativeImage,
  shell,
  Tray,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AddProfileInput } from "../shared/contracts";
import {
  isTrustedRendererUrl,
  selectDevelopmentRendererUrl,
} from "./navigation-policy";
import { launchProfile } from "./profiles/profile-launcher";
import { ProfileStore } from "./profiles/profile-store";
import { createAsyncRequestCoalescer } from "./services/concurrency";
import { collectDashboard } from "./services/dashboard";

const rendererFilePath = path.join(__dirname, "../dist/index.html");
const rendererFileUrl = pathToFileURL(rendererFilePath).href;
const developmentServerUrl = selectDevelopmentRendererUrl(
  app.isPackaged,
  process.env.VITE_DEV_SERVER_URL,
);
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function resourcePath(fileName: string, developmentPath: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, fileName)
    : path.join(app.getAppPath(), developmentPath);
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    show: false,
    backgroundColor: "#f4f2ec",
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    ...(!isMac && {
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

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  mainWindow.show();
  mainWindow.focus();
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
  app.whenReady().then(() => {
    if (process.platform === "win32")
      app.setAppUserModelId("io.github.nguyentran4896.quotadeck");
    configureApplicationMenu();
    const profileStore = new ProfileStore(
      app.getPath("userData"),
      process.platform,
    );
    const claudeStatusLineCollectorPath = resourcePath(
      "claude-statusline.cjs",
      path.join("resources", "claude-statusline.cjs"),
    );
    const evidencePath = resourcePath(
      "provider-research.md",
      path.join("docs", "research", "provider-quota-and-auth.md"),
    );
    const dashboardRequests = createAsyncRequestCoalescer(() =>
      collectDashboard(profileStore),
    );
    const getDashboard = () => dashboardRequests.run();
    ipcMain.handle("dashboard:get", (event) => {
      assertTrustedIpcSender(event);
      return getDashboard();
    });
    ipcMain.handle("dashboard:refresh", (event) => {
      assertTrustedIpcSender(event);
      return getDashboard();
    });
    ipcMain.handle("profiles:add", async (event, input: AddProfileInput) => {
      assertTrustedIpcSender(event);
      await profileStore.create(input);
      dashboardRequests.invalidate();
      return getDashboard();
    });
    ipcMain.handle("profiles:remove", async (event, profileId: string) => {
      assertTrustedIpcSender(event);
      const profile = await profileStore.get(profileId);
      if (!profile)
        return { ok: false, message: "Account profile was not found." };
      if (!profile.isManaged) {
        return {
          ok: false,
          message: "Current provider profiles cannot be removed.",
        };
      }

      const confirmation = await dialog.showMessageBox(mainWindow!, {
        type: "warning",
        title: "Remove account profile?",
        message: `Remove ${profile.displayName} from QuotaDeck?`,
        detail:
          "The isolated provider home, including its provider-managed login and local sessions, will be moved to the system Trash or Recycle Bin.",
        buttons: ["Cancel", "Move profile to Trash"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (confirmation.response !== 1) {
        return { ok: false, message: "Profile removal was cancelled." };
      }

      const removed = await profileStore.remove(profileId);
      dashboardRequests.invalidate();
      try {
        await shell.trashItem(removed.profileDirectory);
        return {
          ok: true,
          message: `${removed.profile.displayName} was moved to the system Trash or Recycle Bin.`,
        };
      } catch {
        return {
          ok: true,
          message: `${removed.profile.displayName} was removed from QuotaDeck, but its app-owned directory could not be moved to Trash.`,
        };
      }
    });
    ipcMain.handle("profiles:login", async (event, profileId: string) => {
      assertTrustedIpcSender(event);
      const profile = await profileStore.get(profileId);
      if (!profile)
        return { ok: false, message: "Account profile was not found." };
      return launchProfile(profile, "login", {
        collectorPath: claudeStatusLineCollectorPath,
        runtimePath: process.execPath,
      });
    });
    ipcMain.handle("profiles:launch", async (event, profileId: string) => {
      assertTrustedIpcSender(event);
      const profile = await profileStore.get(profileId);
      if (!profile)
        return { ok: false, message: "Account profile was not found." };
      return launchProfile(profile, "work", {
        collectorPath: claudeStatusLineCollectorPath,
        runtimePath: process.execPath,
      });
    });
    ipcMain.handle("evidence:open", async (event) => {
      assertTrustedIpcSender(event);
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
});
