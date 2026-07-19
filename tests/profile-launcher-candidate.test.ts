import { describe, expect, it } from "vitest";
import { launchCandidate } from "../src/main/profiles/profile-launcher";
import type { TerminalLaunchCandidate } from "../src/main/profiles/terminal-launcher";

// The launcher declares a spawned terminal healthy only after it survives the
// grace window, so exercise the real spawn path with short-lived node scripts.
function nodeCandidate(
  script: string,
  overrides: Partial<TerminalLaunchCandidate> = {},
): TerminalLaunchCandidate {
  return {
    executable: process.execPath,
    args: ["-e", script],
    environment: process.env,
    cwd: process.cwd(),
    ...overrides,
  };
}

describe("launchCandidate early-exit detection", () => {
  it("rejects when a graced terminal exits nonzero inside the window", async () => {
    await expect(
      launchCandidate(
        nodeCandidate("process.exit(3)", { earlyExitGraceMs: 1_000 }),
      ),
    ).rejects.toThrow(/exited with code 3/);
  });

  it("resolves when a graced terminal exits cleanly (fire-and-forget)", async () => {
    await expect(
      launchCandidate(
        nodeCandidate("process.exit(0)", { earlyExitGraceMs: 1_000 }),
      ),
    ).resolves.toBeUndefined();
  });

  it("resolves once a graced terminal survives the grace window", async () => {
    const started = Date.now();
    await expect(
      launchCandidate(
        // Outlives the grace window; a running terminal is a successful launch.
        nodeCandidate("setTimeout(() => {}, 2000)", { earlyExitGraceMs: 150 }),
      ),
    ).resolves.toBeUndefined();
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
  });

  it("resolves immediately on spawn when no grace window is configured", async () => {
    await expect(
      launchCandidate(nodeCandidate("setTimeout(() => {}, 2000)")),
    ).resolves.toBeUndefined();
  });

  it("rejects when the executable cannot be spawned", async () => {
    await expect(
      launchCandidate(
        nodeCandidate("process.exit(0)", {
          executable: "quotadeck-nonexistent-terminal",
          earlyExitGraceMs: 1_000,
        }),
      ),
    ).rejects.toBeInstanceOf(Error);
  });
});
