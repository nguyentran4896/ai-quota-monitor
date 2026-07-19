import type { Page } from "@playwright/test";
import type {
  AccountSnapshot,
  DashboardSnapshot,
  ProviderCliStatus,
  ProviderId,
} from "../src/shared/contracts";

const guidance = {
  headline: "Install the official CLI.",
  windowsCommand: "npm install -g @openai/codex",
  signIn: "Run the CLI and sign in.",
  verify: "codex --version",
  note: null,
};

function cliStatus(provider: ProviderId): ProviderCliStatus {
  return {
    provider,
    source: "path",
    callable: true,
    compatible: true,
    version: "1.0.0",
    message: "Ready",
    installGuidance: guidance,
  };
}

function account(index: number, observedAt: string): AccountSnapshot {
  return {
    id: `account-${index}`,
    provider: index % 2 === 0 ? "codex" : "claude",
    displayName: `Team Account ${index}`,
    identity: `team${index}@example.com`,
    identityVerified: true,
    plan: "Pro",
    authMode: "subscription",
    billingMode: "subscription",
    quotaStatus: "fresh",
    state: "ready",
    lifecycle: "verified",
    providerError: null,
    isActive: false,
    isManaged: true,
    quotaWindows: [
      {
        id: `window-${index}`,
        label: "5-hour window",
        usedPercent: 20 + (index % 5) * 10,
        windowMinutes: 300,
        resetsAt: null,
      },
    ],
    source: {
      label: "Latest local session",
      confidence: "provider-reported",
      observedAt,
    },
    notice: null,
  };
}

// A large, all-launchable collection so the switcher renders many rows and the
// bounded-list contract is actually exercised.
export function manyAccountsDashboard(count = 14): DashboardSnapshot {
  const observedAt = new Date().toISOString();
  return {
    accounts: Array.from({ length: count }, (_, index) =>
      account(index, observedAt),
    ),
    observedAt,
    mode: "live",
    platform: { id: "windows", label: "Windows", shortcutModifier: "Ctrl" },
    capabilities: {
      claude: { managedProfiles: true, reason: null },
      codex: { managedProfiles: true, reason: null },
    },
    cliStatus: { claude: cliStatus("claude"), codex: cliStatus("codex") },
    alertThresholdPercent: null,
  };
}

// Inject a stub QuotaMonitor bridge before the renderer loads, so App reads our
// dashboard instead of falling back to the small demo dataset. Every method
// resolves so no interaction rejects.
export async function injectBridge(
  page: Page,
  dashboard: DashboardSnapshot,
): Promise<void> {
  await page.addInitScript((dash) => {
    const ok = { ok: true, message: "ok" };
    const resolve =
      <T>(value: T) =>
      () =>
        Promise.resolve(value);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).quotaMonitor = {
      getDashboard: resolve(dash),
      refresh: resolve(dash),
      addProfile: resolve(dash),
      removeProfile: resolve(ok),
      renameProfile: resolve(ok),
      beginLogin: resolve(ok),
      launchProfile: resolve(ok),
      chooseCliExecutable: resolve(ok),
      resetCliExecutable: resolve(ok),
      recheckCliExecutable: resolve(ok),
      openCliInstallInstructions: resolve(ok),
      setAlertThreshold: resolve(ok),
      openProviderUsage: resolve(ok),
      openEvidence: resolve(ok),
    };
  }, dashboard);
}
