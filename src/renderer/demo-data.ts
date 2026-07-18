import type { DashboardSnapshot } from "../shared/contracts";

const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

export const demoDashboard: DashboardSnapshot = {
  mode: "demo",
  observedAt: new Date().toISOString(),
  accounts: [
    {
      id: "claude-current",
      provider: "claude",
      displayName: "Claude — Studio",
      plan: "Max",
      state: "ready",
      isActive: true,
      isManaged: false,
      quotaWindows: [],
      source: {
        label: "Claude auth status",
        confidence: "local-observation",
        observedAt: new Date().toISOString(),
      },
      notice: "Claude confirms this account is connected, but does not expose subscription quota as structured data.",
    },
    {
      id: "codex-current",
      provider: "codex",
      displayName: "Codex — Personal",
      plan: "Pro",
      state: "ready",
      isActive: true,
      isManaged: false,
      quotaWindows: [
        {
          id: "primary",
          label: "1-week window",
          usedPercent: 3,
          windowMinutes: 10_080,
          resetsAt: inHours(149),
        },
      ],
      source: {
        label: "Latest local Codex session",
        confidence: "provider-reported",
        observedAt: new Date().toISOString(),
      },
      notice: "Updated when Codex records a session event. It is not a live billing API.",
    },
  ],
};
