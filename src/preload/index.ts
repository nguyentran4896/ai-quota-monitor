import { contextBridge, ipcRenderer } from "electron";
import type {
  AddProfileInput,
  AlertThreshold,
  ProviderId,
  QuotaMonitorBridge,
} from "../shared/contracts";

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
  chooseCliExecutable: (provider: ProviderId) =>
    ipcRenderer.invoke("settings:choose-cli", provider),
  resetCliExecutable: (provider: ProviderId) =>
    ipcRenderer.invoke("settings:reset-cli", provider),
  setAlertThreshold: (threshold: AlertThreshold) =>
    ipcRenderer.invoke("settings:set-alert-threshold", threshold),
  openProviderUsage: (provider: ProviderId) =>
    ipcRenderer.invoke("usage:open", provider),
  openEvidence: () => ipcRenderer.invoke("evidence:open"),
});

contextBridge.exposeInMainWorld("quotaMonitor", bridge);
