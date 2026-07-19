import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  AddProfileInput,
  AlertThreshold,
  ProviderId,
  QuotaMonitorBridge,
  UpdateReadyInfo,
} from "../shared/contracts";

const bridge: QuotaMonitorBridge = Object.freeze({
  getDashboard: () => ipcRenderer.invoke("dashboard:get"),
  refresh: () => ipcRenderer.invoke("dashboard:refresh"),
  addProfile: (input: AddProfileInput) =>
    ipcRenderer.invoke("profiles:add", input),
  removeProfile: (profileId: string) =>
    ipcRenderer.invoke("profiles:remove", profileId),
  renameProfile: (profileId: string, displayName: string) =>
    ipcRenderer.invoke("profiles:rename", profileId, displayName),
  beginLogin: (profileId: string) =>
    ipcRenderer.invoke("profiles:login", profileId),
  launchProfile: (profileId: string) =>
    ipcRenderer.invoke("profiles:launch", profileId),
  chooseCliExecutable: (provider: ProviderId) =>
    ipcRenderer.invoke("settings:choose-cli", provider),
  resetCliExecutable: (provider: ProviderId) =>
    ipcRenderer.invoke("settings:reset-cli", provider),
  recheckCliExecutable: (provider: ProviderId) =>
    ipcRenderer.invoke("settings:recheck-cli", provider),
  openCliInstallInstructions: (provider: ProviderId) =>
    ipcRenderer.invoke("settings:open-install", provider),
  setAlertThreshold: (threshold: AlertThreshold) =>
    ipcRenderer.invoke("settings:set-alert-threshold", threshold),
  openProviderUsage: (provider: ProviderId) =>
    ipcRenderer.invoke("usage:open", provider),
  openEvidence: () => ipcRenderer.invoke("evidence:open"),
  onUpdateDownloaded: (listener: (info: UpdateReadyInfo) => void) => {
    const channel = "updates:downloaded";
    const handler = (_event: IpcRendererEvent, info: UpdateReadyInfo) =>
      listener(info);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  installUpdate: () => {
    void ipcRenderer.invoke("updates:install");
  },
});

contextBridge.exposeInMainWorld("quotaMonitor", bridge);
