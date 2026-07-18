import { app, BrowserWindow, ipcMain, Menu, shell } from "electron";
import path from "node:path";
import { collectDashboard } from "./services/dashboard";
import { ProfileStore } from "./profiles/profile-store";
import { launchProfile } from "./profiles/profile-launcher";
import type { AddProfileInput } from "../shared/contracts";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow(): void {
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
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.local.aiquotamonitor");
  Menu.setApplicationMenu(null);
  const profileStore = new ProfileStore(app.getPath("userData"));
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
    return launchProfile(profile, "login");
  });
  ipcMain.handle("profiles:launch", async (_event, profileId: string) => {
    const profile = await profileStore.get(profileId);
    if (!profile) return { ok: false, message: "Account profile was not found." };
    return launchProfile(profile, "work");
  });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
