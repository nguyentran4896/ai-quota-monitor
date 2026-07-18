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
    expect(
      screen.getByRole("progressbar", { name: "97% available" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Browser preview")).toBeInTheDocument();
    expect(screen.getByText("Ctrl K")).toBeInTheDocument();
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
      beginLogin: vi.fn(),
      launchProfile: vi.fn(),
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
});
