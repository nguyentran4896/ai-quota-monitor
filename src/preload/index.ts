import { contextBridge, ipcRenderer } from "electron";
import type { AddProfileInput, QuotaMonitorBridge } from "../shared/contracts";

const bridge: QuotaMonitorBridge = Object.freeze({
  getDashboard: () => ipcRenderer.invoke("dashboard:get"),
  refresh: () => ipcRenderer.invoke("dashboard:refresh"),
  addProfile: (input: AddProfileInput) =>
    ipcRenderer.invoke("profiles:add", input),
  removeProfile: (profileId: string) =>
    ipcRenderer.invoke("profiles:remove", profileId),
  beginLogin: (profileId: string) =>
    ipcRenderer.invoke("profiles:login", profileId),
  launchProfile: (profileId: string) =>
    ipcRenderer.invoke("profiles:launch", profileId),
  openEvidence: () => ipcRenderer.invoke("evidence:open"),
});

contextBridge.exposeInMainWorld("quotaMonitor", bridge);
