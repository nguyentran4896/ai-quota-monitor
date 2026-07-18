import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CliSettingsStore } from "../src/main/settings/cli-settings-store";
import {
  parseProviderCliVersion,
  probeProviderCommand,
} from "../src/main/settings/cli-probe";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("probeProviderCommand", () => {
  it("reports an unrelated callable executable as incompatible", async () => {
    await expect(
      probeProviderCommand("codex", process.execPath, "custom"),
    ).resolves.toMatchObject({
      provider: "codex",
      source: "custom",
      callable: true,
      compatible: false,
    });
  });

  it("normalizes supported official versions and discards arbitrary output", () => {
    expect(parseProviderCliVersion("claude", "2.1.214 (Claude Code)")).toEqual({
      version: "2.1.214",
      compatible: true,
    });
    expect(parseProviderCliVersion("codex", "codex-cli 0.139.0")).toEqual({
      version: "0.139.0",
      compatible: true,
    });
    expect(
      parseProviderCliVersion("codex", "token=secret /Users/name/codex"),
    ).toBeNull();
    expect(parseProviderCliVersion("claude", "2.0.99 (Claude Code)")).toEqual({
      version: "2.0.99",
      compatible: false,
    });
    expect(parseProviderCliVersion("claude", "3.0.0 (Claude Code)")).toEqual({
      version: "3.0.0",
      compatible: false,
    });
    expect(parseProviderCliVersion("codex", "codex-cli 0.138.9")).toEqual({
      version: "0.138.9",
      compatible: false,
    });
    expect(parseProviderCliVersion("codex", "codex-cli 1.0.0")).toEqual({
      version: "1.0.0",
      compatible: false,
    });
    expect(
      parseProviderCliVersion("codex", "codex-cli 0.139.0-alpha.1"),
    ).toBeNull();
    expect(
      parseProviderCliVersion("codex", "codex-cli 0.139.0+local"),
    ).toBeNull();
    expect(parseProviderCliVersion("codex", "codex-cli 00.139.0")).toBeNull();
    expect(
      parseProviderCliVersion("codex", "codex-cli 999999999999999999999.139.0"),
    ).toBeNull();
  });

  it("returns repair guidance for an unavailable command", async () => {
    await expect(
      probeProviderCommand(
        "claude",
        "quotadeck-command-does-not-exist",
        "path",
      ),
    ).resolves.toMatchObject({
      provider: "claude",
      source: "path",
      callable: false,
      compatible: false,
    });
  });
});

describe("CliSettingsStore", () => {
  it("uses provider command names until a user selects an executable", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-cli-settings-"),
    );
    temporaryDirectories.push(dataDirectory);
    const store = new CliSettingsStore(dataDirectory);

    expect(await store.getCommands()).toEqual({
      claude: "claude",
      codex: "codex",
    });

    const executable = path.join(dataDirectory, "codex-test.exe");
    await writeFile(executable, "test", "utf8");
    await store.setCommand("codex", executable);
    expect(await store.getCommands()).toEqual({
      claude: "claude",
      codex: executable,
    });

    await store.resetCommand("codex");
    expect((await store.getCommands()).codex).toBe("codex");
  });

  it("rejects relative and missing executable paths", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-cli-settings-"),
    );
    temporaryDirectories.push(dataDirectory);
    const store = new CliSettingsStore(dataDirectory);

    await expect(store.setCommand("claude", "claude.exe")).rejects.toThrow(
      "absolute",
    );
    await expect(
      store.setCommand("claude", path.join(dataDirectory, "missing.exe")),
    ).rejects.toThrow("existing file");
  });
});
