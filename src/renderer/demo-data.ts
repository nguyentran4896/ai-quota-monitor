import type { DashboardSnapshot } from "../shared/contracts";

const inHours = (hours: number) =>
  new Date(Date.now() + hours * 3_600_000).toISOString();

export const demoDashboard: DashboardSnapshot = {
  mode: "demo",
  observedAt: new Date().toISOString(),
  platform: {
    id: "unknown",
    label: "Browser preview",
    shortcutModifier: "Ctrl",
  },
  capabilities: {
    claude: { managedProfiles: true, reason: null },
    codex: { managedProfiles: true, reason: null },
  },
  cliStatus: {
    claude: {
      provider: "claude",
      source: "path",
      callable: true,
      compatible: true,
      version: "2.1.214",
      message: "Claude Code is available on the application PATH.",
      installGuidance: {
        headline: "Install the official Claude Code CLI, then sign in once.",
        windowsCommand: "irm https://claude.ai/install.ps1 | iex",
        signIn: "Run claude and follow the browser sign-in.",
        verify: "claude --version",
        note: "winget install Anthropic.ClaudeCode also works.",
      },
    },
    codex: {
      provider: "codex",
      source: "path",
      callable: true,
      compatible: true,
      version: "0.139.0",
      message: "Codex is available on the application PATH.",
      installGuidance: {
        headline:
          "Install the standalone Codex CLI, then sign in with ChatGPT.",
        windowsCommand: "npm install -g @openai/codex",
        signIn: "Run codex and choose Sign in with ChatGPT.",
        verify: "codex --version",
        note: "The ChatGPT desktop app and Microsoft Store listing are not the Codex CLI.",
      },
    },
  },
  alertThresholdPercent: null,
  accounts: [
    {
      id: "claude-current",
      provider: "claude",
      displayName: "Claude — Studio",
      identity: "a***@example.com",
      identityVerified: true,
      plan: "Max",
      authMode: "subscription",
      billingMode: "subscription",
      quotaStatus: "needs-first-response",
      state: "ready",
      lifecycle: "verified",
      providerError: null,
      isActive: true,
      isManaged: false,
      quotaWindows: [],
      source: {
        label: "Claude auth status",
        confidence: "local-observation",
        observedAt: new Date().toISOString(),
      },
      notice:
        "Claude confirms this account is connected, but does not expose subscription quota as structured data.",
    },
    {
      id: "codex-current",
      provider: "codex",
      displayName: "Codex — Personal",
      identity: "d***@example.com",
      identityVerified: true,
      plan: "Pro",
      authMode: "subscription",
      billingMode: "subscription",
      quotaStatus: "fresh",
      state: "ready",
      lifecycle: "verified",
      providerError: null,
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
      notice:
        "Updated when Codex records a session event. It is not a live billing API.",
    },
  ],
};
