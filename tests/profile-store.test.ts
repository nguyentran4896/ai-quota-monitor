import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProfileLaunchSpec } from "../src/main/profiles/profile-launcher";
import { ProfileStore } from "../src/main/profiles/profile-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("ProfileStore", () => {
  it("creates an isolated provider home without storing credentials", async () => {
    const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "quotadeck-test-"));
    temporaryDirectories.push(dataDirectory);
    const store = new ProfileStore(dataDirectory);

    const profile = await store.create({ provider: "claude", displayName: "  Client   Max  " });
    expect(profile.displayName).toBe("Client Max");
    expect(profile.configRoot).toContain(path.join("profiles", profile.id, "claude-home"));

    const registry = await readFile(path.join(dataDirectory, "profiles.json"), "utf8");
    expect(registry).not.toMatch(/token|credential|password/i);
    expect(await store.list()).toHaveLength(3);
  });

  it("rejects unsafe or empty display names", async () => {
    const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "quotadeck-test-"));
    temporaryDirectories.push(dataDirectory);
    const store = new ProfileStore(dataDirectory);
    await expect(store.create({ provider: "codex", displayName: " " })).rejects.toThrow("between 2 and 48");
  });
});

describe("createProfileLaunchSpec", () => {
  it("isolates Claude with a process-scoped config directory", () => {
    const spec = createProfileLaunchSpec(
      {
        id: "profile-1",
        provider: "claude",
        displayName: "Work Claude",
        configRoot: "C:\\QuotaDeck\\claude-1",
        isManaged: true,
        createdAt: "2026-07-18T00:00:00.000Z",
      },
      "login",
      { PATH: "C:\\Windows", ANTHROPIC_API_KEY: "must-not-leak", CLAUDE_CODE_USE_BEDROCK: "1" },
    );

    expect(spec.executable).toBe("claude");
    expect(spec.args).toEqual(["auth", "login", "--claudeai"]);
    expect(spec.environment.CLAUDE_CONFIG_DIR).toBe("C:\\QuotaDeck\\claude-1");
    expect(spec.environment.CODEX_HOME).toBeUndefined();
    expect(spec.environment.ANTHROPIC_API_KEY).toBeUndefined();
    expect(spec.environment.CLAUDE_CODE_USE_BEDROCK).toBeUndefined();
  });

  it("isolates Codex without mutating the supplied environment", () => {
    const base = { PATH: "C:\\Windows", OPENAI_API_KEY: "must-not-leak" };
    const spec = createProfileLaunchSpec(
      {
        id: "profile-2",
        provider: "codex",
        displayName: "Personal Codex",
        configRoot: "C:\\QuotaDeck\\codex-1",
        isManaged: true,
        createdAt: "2026-07-18T00:00:00.000Z",
      },
      "work",
      base,
    );

    expect(spec.executable).toBe("codex");
    expect(spec.args).toEqual([]);
    expect(spec.environment.CODEX_HOME).toBe("C:\\QuotaDeck\\codex-1");
    expect(spec.environment.OPENAI_API_KEY).toBeUndefined();
    expect(base).toEqual({ PATH: "C:\\Windows", OPENAI_API_KEY: "must-not-leak" });
  });
});
