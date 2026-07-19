import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/renderer/App";
import { demoDashboard } from "../src/renderer/demo-data";
import type {
  AccountSnapshot,
  DashboardSnapshot,
} from "../src/shared/contracts";

function account(overrides: Partial<AccountSnapshot>): AccountSnapshot {
  return {
    id: "id",
    provider: "codex",
    displayName: "Account",
    identity: "user@example.com",
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
    quotaWindows: [],
    source: {
      label: "Latest local session",
      confidence: "provider-reported",
      observedAt: new Date().toISOString(),
    },
    notice: null,
    ...overrides,
  };
}

// A large, mixed collection to exercise search, filters, sort, and scaling.
function manyAccountsDashboard(): DashboardSnapshot {
  const accounts: AccountSnapshot[] = [
    account({
      id: "claude-ready",
      provider: "claude",
      displayName: "Claude Primary",
      identity: "primary@studio.dev",
      quotaWindows: [
        {
          id: "w",
          label: "5-hour window",
          usedPercent: 10,
          windowMinutes: 300,
          resetsAt: null,
        },
      ],
    }),
    account({
      id: "codex-setup",
      provider: "codex",
      displayName: "Codex Staging",
      identity: null,
      lifecycle: "pending-login",
      state: "signed-out",
      quotaStatus: "signed-out",
      identityVerified: false,
    }),
    account({
      id: "codex-error",
      provider: "codex",
      displayName: "Codex Broken",
      lifecycle: "provider-error",
      providerError: "cli-missing",
      state: "unknown",
    }),
  ];
  for (let index = 0; index < 11; index += 1) {
    accounts.push(
      account({
        id: `codex-bulk-${index}`,
        displayName: `Codex Team ${index}`,
        identity: `team${index}@example.com`,
      }),
    );
  }
  return { ...demoDashboard, mode: "live", accounts };
}

function bridgeFor(dashboard: DashboardSnapshot) {
  return {
    getDashboard: vi.fn().mockResolvedValue(dashboard),
    refresh: vi.fn().mockResolvedValue(dashboard),
    addProfile: vi.fn(),
    removeProfile: vi.fn(),
    renameProfile: vi.fn(),
    beginLogin: vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Sign-in started." }),
    launchProfile: vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Session launched." }),
    chooseCliExecutable: vi.fn(),
    resetCliExecutable: vi.fn(),
    recheckCliExecutable: vi.fn(),
    openCliInstallInstructions: vi.fn(),
    setAlertThreshold: vi.fn(),
    openProviderUsage: vi.fn(),
    openEvidence: vi.fn(),
  };
}

async function openAccounts(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Your AI runway,");
  await user.click(screen.getByRole("button", { name: /Accounts/i }));
}

describe("Accounts management destination", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.localStorage.clear();
    delete window.quotaMonitor;
  });

  it("navigates to a real Accounts destination with aria-current", async () => {
    window.quotaMonitor = bridgeFor(manyAccountsDashboard());
    const user = userEvent.setup();
    render(<App />);
    await openAccounts(user);

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(
      within(nav).getByRole("button", { name: /Accounts/i }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("region", { name: "Account management" }),
    ).toBeInTheDocument();
    // Search + filter controls make it a management surface, not just a list.
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by provider" }),
    ).toBeInTheDocument();
  });

  it("filters the collection by search text and provider", async () => {
    window.quotaMonitor = bridgeFor(manyAccountsDashboard());
    const user = userEvent.setup();
    render(<App />);
    await openAccounts(user);

    expect(screen.getByText(/Showing 14 of 14 accounts/)).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "Broken");
    expect(screen.getByText(/Showing 1 of 14/)).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Codex Broken account" }),
    ).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by provider" }),
      "claude",
    );
    expect(screen.getByText(/Showing 1 of 14/)).toBeInTheDocument();
    expect(
      screen.getByRole("article", { name: "Claude Primary account" }),
    ).toBeInTheDocument();
  });

  it("filters to accounts that still need setup", async () => {
    window.quotaMonitor = bridgeFor(manyAccountsDashboard());
    const user = userEvent.setup();
    render(<App />);
    await openAccounts(user);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filter by status" }),
      "needs-setup",
    );
    expect(screen.getByText(/Showing 1 of 14/)).toBeInTheDocument();
    const card = screen.getByRole("article", { name: "Codex Staging account" });
    // A setup-blocked account offers setup, never a launch.
    expect(
      within(card).getByRole("button", { name: /Set up this account/i }),
    ).toBeInTheDocument();
  });

  it("pins an account so it persists and floats to the top", async () => {
    window.quotaMonitor = bridgeFor(manyAccountsDashboard());
    const user = userEvent.setup();
    render(<App />);
    await openAccounts(user);

    await user.click(screen.getByRole("button", { name: "Pin Codex Team 9" }));
    expect(window.localStorage.getItem("quotadeck.pinnedAccounts")).toContain(
      "codex-bulk-9",
    );
    expect(screen.getByText(/1 pinned/)).toBeInTheDocument();

    // The pinned account is now the first card in document order.
    const firstCard = screen.getAllByRole("article")[0];
    expect(within(firstCard!).getByText("Codex Team 9")).toBeInTheDocument();
  });

  it("focuses the search box when Ctrl+K is pressed on the Accounts view", async () => {
    window.quotaMonitor = bridgeFor(manyAccountsDashboard());
    const user = userEvent.setup();
    render(<App />);
    await openAccounts(user);

    const search = screen.getByRole("searchbox");
    expect(search).not.toHaveFocus();
    // The shortcut must work here too, not only on the Overview switcher.
    await user.keyboard("{Control>}k{/Control}");
    expect(search).toHaveFocus();
  });

  it("launches a verified account and records it as recently used", async () => {
    const bridge = bridgeFor(manyAccountsDashboard());
    window.quotaMonitor = bridge;
    const user = userEvent.setup();
    render(<App />);
    await openAccounts(user);

    const card = screen.getByRole("article", {
      name: "Claude Primary account",
    });
    await user.click(
      within(card).getByRole("button", { name: /Launch Claude session/i }),
    );
    expect(bridge.launchProfile).toHaveBeenCalledWith("claude-ready");
    expect(window.localStorage.getItem("quotadeck.recentAccounts")).toContain(
      "claude-ready",
    );
  });
});
