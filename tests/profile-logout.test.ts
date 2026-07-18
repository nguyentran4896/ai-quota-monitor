import { describe, expect, it, vi } from "vitest";
import { logoutManagedProfile } from "../src/main/profiles/profile-logout";
import type { ProviderProfile } from "../src/main/profiles/profile-store";

const profile: ProviderProfile = {
  id: "claude-work",
  provider: "claude",
  displayName: "Claude Work",
  configRoot: "C:\\QuotaDeck\\claude-work",
  quotaRoot: "C:\\QuotaDeck\\claude-work",
  isManaged: true,
  verifiedIdentity: "a***@example.com",
  createdAt: "2026-07-18T00:00:00.000Z",
};

describe("logoutManagedProfile", () => {
  it("reports a provider-owned logout before deletion", async () => {
    const logoutClaude = vi.fn().mockResolvedValue(undefined);
    await expect(
      logoutManagedProfile(profile, {
        logoutClaude,
        logoutCodex: vi.fn(),
      }),
    ).resolves.toEqual({
      ok: true,
      message: "Claude Work was signed out through Claude Code.",
    });
    expect(logoutClaude).toHaveBeenCalledWith("C:\\QuotaDeck\\claude-work");
  });

  it("does not claim success when provider logout fails", async () => {
    await expect(
      logoutManagedProfile(profile, {
        logoutClaude: vi.fn().mockRejectedValue(new Error("offline")),
        logoutCodex: vi.fn(),
      }),
    ).resolves.toMatchObject({ ok: false });
  });
});
