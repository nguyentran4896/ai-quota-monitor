import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../src/renderer/App";
import { demoDashboard } from "../src/renderer/demo-data";

describe("App", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.quotaMonitor;
  });

  it("renders the quota dashboard in browser preview mode", async () => {
    render(<App />);
    expect(await screen.findByText("Your AI runway,")).toBeInTheDocument();
    expect(screen.getAllByText("Claude — Studio")).toHaveLength(2);
    // The accessible name carries account, window, usage, and reset context.
    expect(
      screen.getByRole("progressbar", {
        name: /Codex — Personal — 1-week window: 97% available, 3% used/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Browser preview")).toBeInTheDocument();
    expect(screen.getByText("Ctrl K")).toBeInTheDocument();
    const claudeCard = screen.getByRole("article", {
      name: "Claude — Studio account",
    });
    expect(
      within(claudeCard).getByText("a***@example.com"),
    ).toBeInTheDocument();
    expect(
      within(claudeCard).getByText("Subscription login"),
    ).toBeInTheDocument();
    expect(
      within(claudeCard).getByText("Needs first response"),
    ).toBeInTheDocument();
    expect(
      within(claudeCard).getByText(/Claude confirms this account/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Best verified runway by provider"),
    ).toBeInTheDocument();
  });

  it("explains and disables unsafe managed Claude profiles on macOS", async () => {
    const macDashboard = {
      ...demoDashboard,
      mode: "live" as const,
      platform: {
        id: "macos" as const,
        label: "macOS",
        shortcutModifier: "⌘" as const,
      },
      capabilities: {
        claude: {
          managedProfiles: false,
          reason:
            "Claude Code uses one macOS Keychain credential, so independent Claude profiles are not currently safe.",
        },
        codex: { managedProfiles: true, reason: null },
      },
    };
    window.quotaMonitor = {
      getDashboard: vi.fn().mockResolvedValue(macDashboard),
      refresh: vi.fn().mockResolvedValue(macDashboard),
      addProfile: vi.fn(),
      removeProfile: vi.fn(),
      renameProfile: vi.fn(),
      beginLogin: vi.fn(),
      launchProfile: vi.fn(),
      chooseCliExecutable: vi.fn(),
      resetCliExecutable: vi.fn(),
      recheckCliExecutable: vi.fn(),
      openCliInstallInstructions: vi.fn(),
      setAlertThreshold: vi.fn(),
      openProviderUsage: vi.fn(),
      openEvidence: vi.fn(),
    };

    render(<App />);
    expect(await screen.findByText("macOS")).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Add account/i }));

    expect(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /Claude/i,
      }),
    ).toBeDisabled();
    expect(
      screen.getByText(/one macOS Keychain credential/i),
    ).toBeInTheDocument();
    expect(screen.getByText("⌘ K")).toBeInTheDocument();
  });

  it("tags the shell with the platform so Linux can drop the custom title bar", async () => {
    const linuxDashboard = {
      ...demoDashboard,
      mode: "live" as const,
      platform: {
        id: "linux" as const,
        label: "Linux",
        shortcutModifier: "Ctrl" as const,
      },
    };
    window.quotaMonitor = {
      getDashboard: vi.fn().mockResolvedValue(linuxDashboard),
      refresh: vi.fn().mockResolvedValue(linuxDashboard),
      addProfile: vi.fn(),
      removeProfile: vi.fn(),
      renameProfile: vi.fn(),
      beginLogin: vi.fn(),
      launchProfile: vi.fn(),
      chooseCliExecutable: vi.fn(),
      resetCliExecutable: vi.fn(),
      recheckCliExecutable: vi.fn(),
      openCliInstallInstructions: vi.fn(),
      setAlertThreshold: vi.fn(),
      openProviderUsage: vi.fn(),
      openEvidence: vi.fn(),
    };
    const { container } = render(<App />);
    await screen.findByText("Your AI runway,");
    expect(container.querySelector(".app-shell")).toHaveClass("platform-linux");
  });

  it("shows simple per-provider CLI repair controls", async () => {
    render(<App />);
    await screen.findByText("Your AI runway,");
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Settings" }));

    const dialog = screen.getByRole("dialog", { name: "CLI settings" });
    expect(within(dialog).getByText("2.1.214")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", {
        name: "Choose Claude Code executable",
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Choose Codex executable" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Refresh" }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("combobox", {
        name: "Local quota alert threshold",
      }),
    ).toHaveValue("off");
  });

  it("shows Windows setup guidance and re-check/install actions when a CLI is missing", async () => {
    const missingCodex = {
      ...demoDashboard,
      mode: "live" as const,
      cliStatus: {
        ...demoDashboard.cliStatus,
        codex: {
          ...demoDashboard.cliStatus.codex,
          callable: false,
          compatible: false,
          version: null,
          message:
            "Codex is not callable. Install its official standalone CLI or choose its executable in Settings.",
        },
      },
    };
    const recheckCliExecutable = vi.fn().mockResolvedValue({
      ok: false,
      message: "Codex is not callable.",
    });
    const openCliInstallInstructions = vi.fn().mockResolvedValue({
      ok: true,
      message: "Codex install instructions opened in your browser.",
    });
    window.quotaMonitor = {
      getDashboard: vi.fn().mockResolvedValue(missingCodex),
      refresh: vi.fn().mockResolvedValue(missingCodex),
      addProfile: vi.fn(),
      removeProfile: vi.fn(),
      renameProfile: vi.fn(),
      beginLogin: vi.fn(),
      launchProfile: vi.fn(),
      chooseCliExecutable: vi.fn(),
      resetCliExecutable: vi.fn(),
      recheckCliExecutable,
      openCliInstallInstructions,
      setAlertThreshold: vi.fn(),
      openProviderUsage: vi.fn(),
      openEvidence: vi.fn(),
    };
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Your AI runway,");
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const dialog = screen.getByRole("dialog", { name: "CLI settings" });
    // The install command and the Store-app caveat come from the official docs.
    expect(
      within(dialog).getByText("npm install -g @openai/codex"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        /Microsoft Store listing are not the Codex CLI/i,
      ),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Re-check Codex" }),
    );
    expect(recheckCliExecutable).toHaveBeenCalledWith("codex");

    await user.click(
      within(dialog).getByRole("button", {
        name: "Open Codex install instructions",
      }),
    );
    expect(openCliInstallInstructions).toHaveBeenCalledWith("codex");
  });

  it("supports Escape dismissal and returns focus to the dialog trigger", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Your AI runway,");
    const trigger = screen.getByRole("button", { name: /Add account/i });
    await user.click(trigger);
    expect(
      screen.getByRole("dialog", { name: "Add an AI account" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("focuses the account selector when Ctrl+K is pressed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Your AI runway,");
    const options = screen.getAllByRole("option");
    expect(options[0]).not.toHaveFocus();

    await user.keyboard("{Control>}k{/Control}");
    // Item 2: the shortcut must reach a visible selector at every width.
    expect(options[0]).toHaveFocus();
  });

  it("moves through account options with standard listbox arrow keys", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText("Your AI runway,");
    const options = screen.getAllByRole("option");
    // Roving tabindex: only the selected option is initially tabbable.
    expect(options[0]).toHaveAttribute("tabindex", "0");
    expect(options[1]).toHaveAttribute("tabindex", "-1");
    options[0]?.focus();

    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveFocus();
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("tabindex", "0");
    expect(options[0]).toHaveAttribute("tabindex", "-1");
    await user.keyboard("{ArrowUp}");
    expect(options[0]).toHaveFocus();
  });

  it("does not silently fall back when the selected account disappears", async () => {
    const user = userEvent.setup();
    const refreshed = {
      ...demoDashboard,
      accounts: [demoDashboard.accounts[0]!],
    };
    window.quotaMonitor = {
      getDashboard: vi.fn().mockResolvedValue(demoDashboard),
      refresh: vi.fn().mockResolvedValue(refreshed),
      addProfile: vi.fn(),
      removeProfile: vi.fn(),
      renameProfile: vi.fn(),
      beginLogin: vi.fn(),
      launchProfile: vi.fn(),
      chooseCliExecutable: vi.fn(),
      resetCliExecutable: vi.fn(),
      recheckCliExecutable: vi.fn(),
      openCliInstallInstructions: vi.fn(),
      setAlertThreshold: vi.fn(),
      openProviderUsage: vi.fn(),
      openEvidence: vi.fn(),
    };
    render(<App />);
    await screen.findByText("Your AI runway,");
    await user.click(screen.getAllByRole("option")[1]!);
    expect(screen.getByRole("button", { name: /Launch Codex/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByRole("button", { name: /Launch account/i }),
    ).toBeDisabled();
  });

  it("routes an authenticated API-billed profile through launch confirmation", async () => {
    const user = userEvent.setup();
    const apiAccount = {
      ...demoDashboard.accounts[1]!,
      id: "codex-api",
      displayName: "Codex API",
      identity: "a***@example.com",
      isManaged: true,
      state: "unknown" as const,
      authMode: "api-key" as const,
      billingMode: "api" as const,
      quotaStatus: "unavailable" as const,
    };
    const dashboard = { ...demoDashboard, accounts: [apiAccount] };
    const launchProfile = vi
      .fn()
      .mockResolvedValue({ ok: false, message: "Confirmation cancelled." });
    const beginLogin = vi.fn();
    window.quotaMonitor = {
      getDashboard: vi.fn().mockResolvedValue(dashboard),
      refresh: vi.fn().mockResolvedValue(dashboard),
      addProfile: vi.fn(),
      removeProfile: vi.fn(),
      renameProfile: vi.fn(),
      beginLogin,
      launchProfile,
      chooseCliExecutable: vi.fn(),
      resetCliExecutable: vi.fn(),
      recheckCliExecutable: vi.fn(),
      openCliInstallInstructions: vi.fn(),
      setAlertThreshold: vi.fn(),
      openProviderUsage: vi.fn(),
      openEvidence: vi.fn(),
    };
    render(<App />);
    await screen.findByText("Your AI runway,");

    await user.click(screen.getByRole("button", { name: /Launch Codex/i }));

    expect(launchProfile).toHaveBeenCalledWith("codex-api");
    expect(beginLogin).not.toHaveBeenCalled();
  });

  it("offers setup (not launch) for a newly created managed profile and calls beginLogin", async () => {
    const user = userEvent.setup();
    // A freshly created managed profile: signed out, never verified. Even if the
    // CLI probe had failed it lands in pending-login, so it must offer setup.
    const newProfile = {
      ...demoDashboard.accounts[0]!,
      id: "claude-new",
      displayName: "Claude New",
      identity: null,
      identityVerified: false,
      isManaged: true,
      isActive: false,
      authMode: "signed-out" as const,
      billingMode: "unknown" as const,
      quotaStatus: "signed-out" as const,
      state: "signed-out" as const,
      lifecycle: "pending-login" as const,
      providerError: null,
    };
    const dashboard = { ...demoDashboard, accounts: [newProfile] };
    const beginLogin = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Opening sign-in…" });
    const launchProfile = vi.fn();
    window.quotaMonitor = {
      getDashboard: vi.fn().mockResolvedValue(dashboard),
      refresh: vi.fn().mockResolvedValue(dashboard),
      addProfile: vi.fn(),
      removeProfile: vi.fn(),
      renameProfile: vi.fn(),
      beginLogin,
      launchProfile,
      chooseCliExecutable: vi.fn(),
      resetCliExecutable: vi.fn(),
      recheckCliExecutable: vi.fn(),
      openCliInstallInstructions: vi.fn(),
      setAlertThreshold: vi.fn(),
      openProviderUsage: vi.fn(),
      openEvidence: vi.fn(),
    };
    render(<App />);
    await screen.findByText("Your AI runway,");

    const setupButton = await screen.findByRole("button", {
      name: /Set up this account/i,
    });
    expect(
      screen.queryByRole("button", { name: /^Launch/i }),
    ).not.toBeInTheDocument();

    await user.click(setupButton);

    expect(beginLogin).toHaveBeenCalledWith("claude-new");
    expect(launchProfile).not.toHaveBeenCalled();
  });

  it("uses specific quota-unavailable states, a distinct status dot, and key shortcuts", async () => {
    const errored = {
      ...demoDashboard.accounts[0]!,
      id: "claude-error",
      displayName: "Claude Broken",
      identity: null,
      identityVerified: false,
      isManaged: true,
      isActive: false,
      authMode: "unknown" as const,
      billingMode: "unknown" as const,
      quotaStatus: "unavailable" as const,
      state: "unknown" as const,
      lifecycle: "provider-error" as const,
      providerError: "cli-missing" as const,
      quotaWindows: [],
    };
    const dashboard = { ...demoDashboard, accounts: [errored] };
    window.quotaMonitor = {
      getDashboard: vi.fn().mockResolvedValue(dashboard),
      refresh: vi.fn().mockResolvedValue(dashboard),
      addProfile: vi.fn(),
      removeProfile: vi.fn(),
      renameProfile: vi.fn(),
      beginLogin: vi.fn(),
      launchProfile: vi.fn(),
      chooseCliExecutable: vi.fn(),
      resetCliExecutable: vi.fn(),
      recheckCliExecutable: vi.fn(),
      openCliInstallInstructions: vi.fn(),
      setAlertThreshold: vi.fn(),
      openProviderUsage: vi.fn(),
      openEvidence: vi.fn(),
    };
    render(<App />);
    await screen.findByText("Your AI runway,");

    // Not a generic "Quota hidden".
    expect(screen.getByText(/CLI unavailable/)).toBeInTheDocument();
    expect(screen.queryByText("Quota hidden")).not.toBeInTheDocument();

    // The status dot is distinct and carries meaningful accessible text.
    const card = screen.getByRole("article", { name: "Claude Broken account" });
    const dot = within(card).getByRole("img", {
      name: "Status: Provider CLI unavailable",
    });
    expect(dot).toHaveClass("tone-error");

    // Ctrl/⌘+K is exposed as a keyboard shortcut on the selector.
    expect(
      screen.getByRole("listbox", { name: "AI accounts" }),
    ).toHaveAttribute("aria-keyshortcuts", "Control+K");
  });

  it("renders a full 48-character Unicode/emoji label with intact card actions", async () => {
    const label = "🚀 Клиент café — Very Long Account Label 12345 ✅"; // 48 code points
    const managed = {
      ...demoDashboard.accounts[0]!,
      id: "claude-long",
      displayName: label,
      isManaged: true,
      isActive: false,
      lifecycle: "verified" as const,
    };
    const dashboard = { ...demoDashboard, accounts: [managed] };
    window.quotaMonitor = {
      getDashboard: vi.fn().mockResolvedValue(dashboard),
      refresh: vi.fn().mockResolvedValue(dashboard),
      addProfile: vi.fn(),
      removeProfile: vi.fn(),
      renameProfile: vi.fn(),
      beginLogin: vi.fn(),
      launchProfile: vi.fn(),
      chooseCliExecutable: vi.fn(),
      resetCliExecutable: vi.fn(),
      recheckCliExecutable: vi.fn(),
      openCliInstallInstructions: vi.fn(),
      setAlertThreshold: vi.fn(),
      openProviderUsage: vi.fn(),
      openEvidence: vi.fn(),
    };
    render(<App />);
    await screen.findByText("Your AI runway,");

    const card = screen.getByRole("article", { name: `${label} account` });
    expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent(
      label,
    );
    // The rename and remove controls remain reachable next to the long label.
    expect(
      within(card).getByRole("button", { name: `Rename ${label}` }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: `Remove ${label}` }),
    ).toBeInTheDocument();
  });

  it("shows a dismissible, account-identifying toast outside the switcher", async () => {
    const user = userEvent.setup();
    const managed = {
      ...demoDashboard.accounts[1]!,
      id: "codex-managed",
      displayName: "Codex Work",
      isManaged: true,
      isActive: false,
      lifecycle: "verified" as const,
    };
    const dashboard = { ...demoDashboard, accounts: [managed] };
    window.quotaMonitor = {
      getDashboard: vi.fn().mockResolvedValue(dashboard),
      refresh: vi.fn().mockResolvedValue(dashboard),
      addProfile: vi.fn(),
      removeProfile: vi.fn(),
      renameProfile: vi.fn(),
      beginLogin: vi.fn(),
      launchProfile: vi
        .fn()
        .mockResolvedValue({ ok: true, message: "Launched Codex Work." }),
      chooseCliExecutable: vi.fn(),
      resetCliExecutable: vi.fn(),
      recheckCliExecutable: vi.fn(),
      openCliInstallInstructions: vi.fn(),
      setAlertThreshold: vi.fn(),
      openProviderUsage: vi.fn(),
      openEvidence: vi.fn(),
    };
    render(<App />);
    await screen.findByText("Your AI runway,");

    await user.click(screen.getByRole("button", { name: /Launch Codex/i }));

    const toast = await screen.findByRole("status");
    expect(toast).toHaveTextContent("Codex Work: Launched Codex Work.");
    // The toast lives outside the switcher aside, so it does not follow the
    // selected account.
    expect(toast.closest(".switcher-panel")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("saves the alert threshold optimistically without a provider refresh", async () => {
    const user = userEvent.setup();
    const refresh = vi.fn().mockResolvedValue(demoDashboard);
    const setAlertThreshold = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Alerts at 85% used." });
    window.quotaMonitor = {
      getDashboard: vi.fn().mockResolvedValue(demoDashboard),
      refresh,
      addProfile: vi.fn(),
      removeProfile: vi.fn(),
      renameProfile: vi.fn(),
      beginLogin: vi.fn(),
      launchProfile: vi.fn(),
      chooseCliExecutable: vi.fn(),
      resetCliExecutable: vi.fn(),
      recheckCliExecutable: vi.fn(),
      openCliInstallInstructions: vi.fn(),
      setAlertThreshold,
      openProviderUsage: vi.fn(),
      openEvidence: vi.fn(),
    };
    render(<App />);
    await screen.findByText("Your AI runway,");
    await user.click(screen.getByRole("button", { name: "Settings" }));

    const dialog = screen.getByRole("dialog", { name: "CLI settings" });
    const select = within(dialog).getByRole("combobox", {
      name: "Local quota alert threshold",
    });
    await user.selectOptions(select, "85");

    // Control updates immediately and persistence is not a full collection.
    expect(select).toHaveValue("85");
    expect(setAlertThreshold).toHaveBeenCalledWith(85);
    expect(await within(dialog).findByText("Saved")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renames a managed profile through the rename dialog", async () => {
    const user = userEvent.setup();
    const managed = {
      ...demoDashboard.accounts[1]!,
      id: "codex-managed",
      displayName: "Codex Work",
      isManaged: true,
      isActive: false,
      lifecycle: "verified" as const,
    };
    const dashboard = { ...demoDashboard, accounts: [managed] };
    const renameProfile = vi
      .fn()
      .mockResolvedValue({ ok: true, message: "Renamed to Codex Client." });
    window.quotaMonitor = {
      getDashboard: vi.fn().mockResolvedValue(dashboard),
      refresh: vi.fn().mockResolvedValue(dashboard),
      addProfile: vi.fn(),
      removeProfile: vi.fn(),
      renameProfile,
      beginLogin: vi.fn(),
      launchProfile: vi.fn(),
      chooseCliExecutable: vi.fn(),
      resetCliExecutable: vi.fn(),
      recheckCliExecutable: vi.fn(),
      openCliInstallInstructions: vi.fn(),
      setAlertThreshold: vi.fn(),
      openProviderUsage: vi.fn(),
      openEvidence: vi.fn(),
    };
    render(<App />);
    await screen.findByText("Your AI runway,");

    await user.click(
      screen.getByRole("button", { name: /Rename Codex Work/i }),
    );
    const dialog = screen.getByRole("dialog", { name: /Rename account/i });
    const input = within(dialog).getByLabelText("Account label");
    await user.clear(input);
    await user.type(input, "Codex Client");
    await user.click(
      within(dialog).getByRole("button", { name: /Save label/i }),
    );

    expect(renameProfile).toHaveBeenCalledWith("codex-managed", "Codex Client");
  });
});
