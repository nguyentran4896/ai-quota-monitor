import { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, Tray } from "electron";
import path from "node:path";
import { collectDashboard } from "./services/dashboard";
import { ProfileStore } from "./profiles/profile-store";
import { launchProfile } from "./profiles/profile-launcher";
import type { AddProfileInput } from "../shared/contracts";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    show: false,
    backgroundColor: "#f4f2ec",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#f3f1eb",
      symbolColor: "#1d2a27",
      height: 40,
    },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const allowedOrigin = process.env.VITE_DEV_SERVER_URL ?? "file://";
    if (!url.startsWith(allowedOrigin)) event.preventDefault();
  });

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  return window;
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  mainWindow.show();
  mainWindow.focus();
}

function createTray(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(app.getAppPath(), "build", "icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
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
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (app.isReady()) showMainWindow();
  });
  app.whenReady().then(() => {
    app.setAppUserModelId("com.local.aiquotamonitor");
    Menu.setApplicationMenu(null);
    const profileStore = new ProfileStore(app.getPath("userData"));
    const claudeStatusLineScriptPath = app.isPackaged
      ? path.join(process.resourcesPath, "claude-statusline.ps1")
      : path.join(app.getAppPath(), "resources", "claude-statusline.ps1");
    const evidencePath = app.isPackaged
      ? path.join(process.resourcesPath, "provider-research.md")
      : path.join(app.getAppPath(), "docs", "research", "provider-quota-and-auth.md");
    const getDashboard = () => collectDashboard(profileStore);
    ipcMain.handle("dashboard:get", getDashboard);
    ipcMain.handle("dashboard:refresh", getDashboard);
    ipcMain.handle("profiles:add", async (_event, input: AddProfileInput) => {
      await profileStore.create(input);
      return getDashboard();
    });
    ipcMain.handle("profiles:login", async (_event, profileId: string) => {
      const profile = await profileStore.get(profileId);
      if (!profile) return { ok: false, message: "Account profile was not found." };
      return launchProfile(profile, "login", { claudeStatusLineScriptPath });
    });
    ipcMain.handle("profiles:launch", async (_event, profileId: string) => {
      const profile = await profileStore.get(profileId);
      if (!profile) return { ok: false, message: "Account profile was not found." };
      return launchProfile(profile, "work", { claudeStatusLineScriptPath });
    });
    ipcMain.handle("evidence:open", async () => {
      const error = await shell.openPath(evidencePath);
      return error
        ? { ok: false, message: `The research report could not be opened: ${error}` }
        : { ok: true, message: "Provider research opened in your default Markdown app." };
    });
    mainWindow = createWindow();
    createTray();

    app.on("activate", () => {
      showMainWindow();
    });
  });
}

app.on("before-quit", () => {
  isQuitting = true;
});
