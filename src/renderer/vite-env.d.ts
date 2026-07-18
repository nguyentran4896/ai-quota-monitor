/// <reference types="vite/client" />

import type { QuotaMonitorBridge } from "../shared/contracts";

declare global {
  interface Window {
    quotaMonitor?: QuotaMonitorBridge;
  }
}

export {};

