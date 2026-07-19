import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildClaudeStatusLineCommand,
  createProfileLaunchSpec,
  createTerminalLaunchCandidates,
  prepareClaudeStatusLine,
} from "../src/main/profiles/profile-launcher";
import { ProfileStore } from "../src/main/profiles/profile-store";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("ProfileStore", () => {
  it("creates an isolated provider home without storing credentials", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-test-"),
    );
    temporaryDirectories.push(dataDirectory);
    const store = new ProfileStore(dataDirectory, "win32");

    const profile = await store.create({
      provider: "claude",
      displayName: "  Client   Max  ",
    });
    expect(profile.displayName).toBe("Client Max");
    expect(profile.configRoot).toContain(
      path.join("profiles", profile.id, "claude-home"),
    );

    const registry = await readFile(
      path.join(dataDirectory, "profiles.json"),
      "utf8",
    );
    expect(registry).not.toMatch(/token|credential|password/i);
    const profiles = await store.list();
    expect(profiles).toHaveLength(3);
    expect(profiles[0]?.quotaRoot).toBe(
      path.join(dataDirectory, "observations", "claude-current"),
    );
  });

  it("keeps managed profiles pending until a masked identity is verified", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-test-"),
    );
    temporaryDirectories.push(dataDirectory);
    const store = new ProfileStore(dataDirectory, "win32");
    const profile = await store.create({
      provider: "codex",
      displayName: "Codex Work",
    });

    expect(profile.verifiedIdentity).toBeNull();
    await expect(
      store.verifyIdentity(profile.id, "developer@example.com", "a".repeat(64)),
    ).rejects.toThrow("masked");
    await store.verifyIdentity(profile.id, "d***@example.com", "a".repeat(64));
    expect((await store.get(profile.id))?.verifiedIdentity).toBe(
      "d***@example.com",
    );
    expect((await store.get(profile.id))?.verifiedIdentityVerifier).toBe(
      "a".repeat(64),
    );
  });

  it("rejects duplicate labels within a provider but allows them across providers", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-dedupe-"),
    );
    temporaryDirectories.push(dataDirectory);
    const store = new ProfileStore(dataDirectory, "win32");

    await store.create({ provider: "codex", displayName: "Work" });

    // Case-fold and whitespace collapse: "work" and "  Work " collide.
    await expect(
      store.create({ provider: "codex", displayName: "work" }),
    ).rejects.toThrow(/already exists/i);
    await expect(
      store.create({ provider: "codex", displayName: "  Work " }),
    ).rejects.toThrow(/already exists/i);

    // The same label under a different provider is allowed.
    await expect(
      store.create({ provider: "claude", displayName: "Work" }),
    ).resolves.toMatchObject({ provider: "claude", displayName: "Work" });
  });

  it("renames a managed profile and enforces uniqueness on rename", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-rename-"),
    );
    temporaryDirectories.push(dataDirectory);
    const store = new ProfileStore(dataDirectory, "win32");
    const first = await store.create({
      provider: "codex",
      displayName: "Personal",
    });
    const second = await store.create({
      provider: "codex",
      displayName: "Work",
    });

    const renamed = await store.rename(second.id, "  Client   Work  ");
    expect(renamed.displayName).toBe("Client Work");
    expect((await store.get(second.id))?.displayName).toBe("Client Work");

    // Cannot rename onto another profile's (case-folded) label.
    await expect(store.rename(second.id, "personal")).rejects.toThrow(
      /already exists/i,
    );
    // Renaming to its own current label is a no-op success.
    await expect(store.rename(first.id, "Personal")).resolves.toMatchObject({
      displayName: "Personal",
    });
  });

  it("keeps legacy duplicate profiles loadable", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-legacy-"),
    );
    temporaryDirectories.push(dataDirectory);
    const store = new ProfileStore(dataDirectory, "win32");
    // Two managed profiles created before dedupe existed. Simulate by writing
    // the registry directly with duplicate labels, then confirm both load.
    const a = await store.create({ provider: "codex", displayName: "Alpha" });
    const b = await store.create({ provider: "codex", displayName: "Beta" });
    const registryPath = path.join(dataDirectory, "profiles.json");
    const stored = JSON.parse(await readFile(registryPath, "utf8")) as {
      schemaVersion: 1;
      profiles: { id: string; displayName: string }[];
    };
    stored.profiles = stored.profiles.map((profile) =>
      profile.id === b.id ? { ...profile, displayName: "Alpha" } : profile,
    );
    await writeFile(registryPath, JSON.stringify(stored, null, 2));

    const managed = (await store.list()).filter((profile) => profile.isManaged);
    expect(managed.map((profile) => profile.displayName).sort()).toEqual([
      "Alpha",
      "Alpha",
    ]);
    expect(managed.map((profile) => profile.id).sort()).toEqual(
      [a.id, b.id].sort(),
    );
  });

  it("rejects unsafe or empty display names", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-test-"),
    );
    temporaryDirectories.push(dataDirectory);
    const store = new ProfileStore(dataDirectory);
    await expect(
      store.create({ provider: "codex", displayName: " " }),
    ).rejects.toThrow("between 2 and 48");
    await expect(
      store.create({ provider: "codex", displayName: "Work\u0000Codex" }),
    ).rejects.toThrow("between 2 and 48");
  });

  it("rejects managed Claude profiles on macOS instead of swapping a global Keychain credential", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-test-"),
    );
    temporaryDirectories.push(dataDirectory);
    const store = new ProfileStore(dataDirectory, "darwin");
    await expect(
      store.create({ provider: "claude", displayName: "Work Claude" }),
    ).rejects.toThrow("macOS Keychain");
    await expect(
      store.create({ provider: "codex", displayName: "Work Codex" }),
    ).resolves.toMatchObject({ provider: "codex" });
  });

  it("keeps a managed profile registered until its trash target is handled", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-remove-test-"),
    );
    temporaryDirectories.push(dataDirectory);
    const store = new ProfileStore(dataDirectory, "win32");
    const first = await store.create({
      provider: "codex",
      displayName: "Disposable Codex",
    });
    const second = await store.create({
      provider: "claude",
      displayName: "Keep Claude",
    });

    await expect(store.remove("codex-current")).rejects.toThrow(
      "Built-in profiles cannot be removed",
    );
    await expect(store.getRemovalTarget(first.id)).resolves.toEqual({
      profile: first,
      profileDirectory: path.dirname(first.configRoot!),
    });
    expect((await store.get(first.id))?.id).toBe(first.id);
    await expect(store.remove(first.id)).resolves.toEqual({
      profile: first,
      profileDirectory: path.dirname(first.configRoot!),
    });
    expect((await store.list()).map((entry) => entry.id)).toEqual([
      "claude-current",
      "codex-current",
      second.id,
    ]);
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
      {
        PATH: "C:\\Windows",
        ANTHROPIC_API_KEY: "must-not-leak",
        CLAUDE_CODE_USE_BEDROCK: "1",
      },
    );

    expect(spec.executable).toBe("claude");
    expect(spec.args).toEqual(["auth", "login", "--claudeai"]);
    expect(spec.environment.CLAUDE_CONFIG_DIR).toBe("C:\\QuotaDeck\\claude-1");
    expect(spec.environment.CODEX_HOME).toBeUndefined();
    expect(spec.environment.ANTHROPIC_API_KEY).toBeUndefined();
    expect(spec.environment.CLAUDE_CODE_USE_BEDROCK).toBeUndefined();
  });

  it("adds the app-managed Claude status-line settings only to work launches", () => {
    const profile = {
      id: "profile-status",
      provider: "claude" as const,
      displayName: "Claude Status",
      configRoot: "C:\\QuotaDeck\\claude-status",
      isManaged: true,
      createdAt: "2026-07-18T00:00:00.000Z",
    };
    expect(
      createProfileLaunchSpec(
        profile,
        "work",
        {},
        "C:\\QuotaDeck\\capture-settings.json",
      ).args,
    ).toEqual(["--settings", "C:\\QuotaDeck\\capture-settings.json"]);
    expect(
      createProfileLaunchSpec(
        profile,
        "login",
        {},
        "C:\\QuotaDeck\\capture-settings.json",
      ).args,
    ).toEqual(["auth", "login", "--claudeai"]);
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
    expect(base).toEqual({
      PATH: "C:\\Windows",
      OPENAI_API_KEY: "must-not-leak",
    });
  });

  it("writes an isolated Claude status-line layer without touching user settings", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-launch-test-"),
    );
    temporaryDirectories.push(dataDirectory);
    const configRoot = path.join(dataDirectory, "claude-home");
    const profile = {
      id: "profile-capture",
      provider: "claude" as const,
      displayName: "Claude Capture",
      configRoot,
      isManaged: true,
      createdAt: "2026-07-18T00:00:00.000Z",
    };

    const prepared = await prepareClaudeStatusLine(profile, {
      collectorPath: "C:\\Program Files\\QuotaDeck\\claude-statusline.cjs",
      runtimePath: "C:\\Program Files\\QuotaDeck\\QuotaDeck.exe",
      platform: "win32",
    });
    expect(prepared.settingsPath).toBe(
      path.join(configRoot, "quotadeck-launch-settings.json"),
    );
    const settings = JSON.parse(
      await readFile(prepared.settingsPath!, "utf8"),
    ) as {
      statusLine: { command: string };
    };
    const encoded = settings.statusLine.command.split(" ").at(-1)!;
    const decoded = Buffer.from(encoded, "base64").toString("utf16le");
    expect(decoded).toContain("ELECTRON_RUN_AS_NODE");
    expect(decoded).toContain(
      "C:\\Program Files\\QuotaDeck\\claude-statusline.cjs",
    );
    expect(decoded).toContain("quotadeck-quota.json");
  });

  it("writes current-account quota observations outside the provider config directory", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-current-capture-test-"),
    );
    temporaryDirectories.push(dataDirectory);
    const quotaRoot = path.join(
      dataDirectory,
      "observations",
      "claude-current",
    );
    const prepared = await prepareClaudeStatusLine(
      {
        id: "claude-current",
        provider: "claude",
        displayName: "Current Claude",
        configRoot: null,
        quotaRoot,
        isManaged: false,
        createdAt: "1970-01-01T00:00:00.000Z",
      },
      {
        collectorPath: "/opt/QuotaDeck/claude-statusline.cjs",
        runtimePath: "/opt/QuotaDeck/quotadeck",
        platform: "linux",
        homeDirectory: dataDirectory,
      },
    );
    expect(prepared.settingsPath).toBe(
      path.join(quotaRoot, "quotadeck-launch-settings.json"),
    );
  });
});

describe("cross-platform profile launching", () => {
  const spec = {
    provider: "claude" as const,
    executable: "claude" as const,
    args: [
      "--settings",
      "/Users/dev/Library/Application Support/QuotaDeck/settings.json",
    ],
    environment: {
      PATH: "/opt/homebrew/bin:/usr/bin",
      CLAUDE_CONFIG_DIR:
        "/Users/dev/Library/Application Support/QuotaDeck/claude-home",
    },
    title: "QuotaDeck - Work Claude",
  };

  it("builds a macOS Terminal launch that keeps profile isolation explicit", () => {
    const [candidate] = createTerminalLaunchCandidates(
      "darwin",
      spec,
      "/Users/dev",
    );
    expect(candidate.executable).toBe("osascript");
    expect(candidate.args.join(" ")).toContain('tell application "Terminal"');
    expect(candidate.args.join(" ")).toContain("CLAUDE_CONFIG_DIR=");
    expect(candidate.args.join(" ")).toContain("ANTHROPIC_API_KEY");
    expect(candidate.args.join(" ")).toContain(
      "PATH=/opt/homebrew/bin:/usr/bin",
    );
  });

  it("keeps adversarial macOS paths inside POSIX and AppleScript quoting", () => {
    const [candidate] = createTerminalLaunchCandidates(
      "darwin",
      {
        ...spec,
        executable: "/Applications/Quota Deck/claude'; touch pwned; '",
      },
      "/Users/O'Brien/$workspace; touch pwned",
    );
    const script = candidate.args[1]!.replaceAll('\\"', '"');
    expect(script).toContain(
      `cd -- '/Users/O'"'"'Brien/$workspace; touch pwned'`,
    );
    expect(script).toContain(
      `'/Applications/Quota Deck/claude'"'"'; touch pwned; '"'"''`,
    );
  });

  it("preserves billing overrides for a built-in macOS current profile", () => {
    const [candidate] = createTerminalLaunchCandidates(
      "darwin",
      {
        provider: "claude",
        executable: "claude",
        args: [],
        environment: {
          PATH: "/opt/homebrew/bin:/usr/bin",
          ANTHROPIC_API_KEY: "current-account-choice",
        },
        title: "QuotaDeck - Current Claude",
      },
      "/Users/dev",
    );

    expect(candidate.args.join(" ")).not.toContain("ANTHROPIC_API_KEY");
  });

  it("offers native Linux terminal candidates without a shell wrapper", () => {
    const candidates = createTerminalLaunchCandidates(
      "linux",
      spec,
      "/home/dev",
    );
    expect(candidates.map((candidate) => candidate.executable)).toEqual([
      "x-terminal-emulator",
      "gnome-terminal",
      "konsole",
      "kitty",
      "alacritty",
      "xterm",
    ]);
    expect(
      candidates.every(
        (candidate) => candidate.environment === spec.environment,
      ),
    ).toBe(true);
  });

  it("offers Windows Terminal with a built-in PowerShell fallback", () => {
    const candidates = createTerminalLaunchCandidates(
      "win32",
      spec,
      "C:\\Users\\dev",
    );
    expect(candidates.map((candidate) => candidate.executable)).toEqual([
      "wt.exe",
      "powershell.exe",
    ]);
  });

  it("keeps adversarial Windows paths inside PowerShell literals", () => {
    const candidates = createTerminalLaunchCandidates(
      "win32",
      {
        ...spec,
        executable: "C:\\Program Files\\Claude & Co\\claude.exe",
        args: ["--settings", "C:\\Users\\O'Brien; Remove-Item x"],
      },
      "C:\\Users\\O'Brien & Team",
    );
    const fallbackCommand = Buffer.from(
      candidates[1]?.args.at(-1) ?? "",
      "base64",
    ).toString("utf16le");
    expect(fallbackCommand).toContain(
      "Set-Location -LiteralPath 'C:\\Users\\O''Brien & Team'",
    );
    expect(fallbackCommand).toContain(
      "& 'C:\\Program Files\\Claude & Co\\claude.exe' '--settings' 'C:\\Users\\O''Brien; Remove-Item x'",
    );
  });

  it("uses the packaged Electron runtime as a portable Claude collector", () => {
    expect(
      buildClaudeStatusLineCommand({
        collectorPath:
          "/Applications/QuotaDeck.app/Contents/Resources/claude-statusline.cjs",
        runtimePath: "/Applications/QuotaDeck.app/Contents/MacOS/QuotaDeck",
        snapshotPath:
          "/Users/dev/Library/Application Support/QuotaDeck/quotadeck-quota.json",
        platform: "darwin",
      }),
    ).toBe(
      "ELECTRON_RUN_AS_NODE=1 '/Applications/QuotaDeck.app/Contents/MacOS/QuotaDeck' " +
        "'/Applications/QuotaDeck.app/Contents/Resources/claude-statusline.cjs' " +
        "'/Users/dev/Library/Application Support/QuotaDeck/quotadeck-quota.json'",
    );
  });

  it("encodes the Windows collector command so shell metacharacters stay data", () => {
    const command = buildClaudeStatusLineCommand({
      runtimePath: "C:\\Users\\A&B%TEMP%\\QuotaDeck.exe",
      collectorPath: "C:\\Program Files\\Quota'Deck\\collector.cjs",
      snapshotPath: "C:\\Users\\A&B\\quota.json",
      platform: "win32",
    });
    const encoded = command.split(" ").at(-1)!;
    const script = Buffer.from(encoded, "base64").toString("utf16le");

    expect(command).toMatch(
      /^powershell\.exe -NoLogo -NoProfile -NonInteractive -EncodedCommand [A-Za-z0-9+/=]+$/,
    );
    expect(script).toContain("C:\\Users\\A&B%TEMP%\\QuotaDeck.exe");
    expect(script).toContain("C:\\Program Files\\Quota''Deck\\collector.cjs");
  });
});
