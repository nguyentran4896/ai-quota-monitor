import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { buildClaudeStatusLineCommand } from "../src/main/profiles/claude-statusline-launch";
import {
  buildPosixProfileCommand,
  buildWindowsProfileScript,
  createTerminalLaunchCandidates,
  LINUX_TERMINAL_EARLY_EXIT_GRACE_MS,
  type TerminalProfileSpec,
} from "../src/main/profiles/terminal-launcher";

function decodePowerShellEncodedCommand(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf16le");
}

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("native status-line shell boundary", () => {
  it("passes metacharacter-heavy paths as literal arguments", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quotadeck-shell-"));
    temporaryDirectories.push(root);
    const specialDirectory = path.join(
      root,
      process.platform === "win32"
        ? "QuotaDeck A&B%TEMP%"
        : "QuotaDeck O'Brien $HOME; safe",
    );
    await mkdir(specialDirectory);
    const collectorPath = path.join(specialDirectory, "collector.cjs");
    const snapshotPath = path.join(specialDirectory, "snapshot result.txt");
    await writeFile(
      collectorPath,
      "require('node:fs').writeFileSync(process.argv[2], process.env.ELECTRON_RUN_AS_NODE || 'missing')\n",
      "utf8",
    );
    const command = buildClaudeStatusLineCommand({
      runtimePath: process.execPath,
      collectorPath,
      snapshotPath,
      platform: process.platform,
    });

    if (process.platform === "win32") {
      await execFileAsync("cmd.exe", ["/d", "/s", "/c", command], {
        timeout: 15_000,
        windowsHide: true,
      });
    } else {
      await execFileAsync("/bin/sh", ["-c", command], { timeout: 15_000 });
    }

    expect(await readFile(snapshotPath, "utf8")).toBe("1");
  });

  it("executes generated terminal commands with literal custom paths", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quotadeck-terminal-"));
    temporaryDirectories.push(root);
    const specialDirectory = path.join(
      root,
      process.platform === "win32"
        ? "Terminal A&B%TEMP%'safe"
        : "Terminal O'Brien $HOME; safe",
    );
    await mkdir(specialDirectory);
    const scriptPath = path.join(specialDirectory, "write argument.cjs");
    const outputPath = path.join(specialDirectory, "terminal result.txt");
    const expected = "literal & %TEMP% $HOME; ' value";
    await writeFile(
      scriptPath,
      "require('node:fs').writeFileSync(process.argv[2], process.argv[3])\n",
      "utf8",
    );
    const spec: TerminalProfileSpec = {
      provider: "codex",
      executable: process.execPath,
      args: [scriptPath, outputPath, expected],
      environment: { ...process.env, CODEX_HOME: specialDirectory },
      title: "QuotaDeck adversarial test",
    };

    if (process.platform === "win32") {
      const fallback = createTerminalLaunchCandidates(
        "win32",
        spec,
        specialDirectory,
      ).find((candidate) => candidate.executable === "powershell.exe");
      expect(fallback).toBeDefined();
      await execFileAsync(
        fallback!.executable,
        fallback!.args.map((argument) =>
          argument === "-NoExit" ? "-NonInteractive" : argument,
        ),
        {
          cwd: fallback!.cwd,
          env: fallback!.environment,
          timeout: 15_000,
          windowsHide: true,
        },
      );
    } else {
      await execFileAsync(
        "/bin/sh",
        ["-c", buildPosixProfileCommand(spec, specialDirectory)],
        { timeout: 15_000 },
      );
    }

    expect(await readFile(outputPath, "utf8")).toBe(expected);
  });
});

describe("Windows terminal profile environment isolation", () => {
  const spec: TerminalProfileSpec = {
    provider: "claude",
    executable: "claude",
    args: ["--settings", "C:\\Users\\Ada\\settings.json"],
    environment: {
      Path: "C:\\tools;C:\\Users\\Ada\\AppData\\Roaming\\npm",
      CLAUDE_CONFIG_DIR: "C:\\Users\\Ada\\.quotadeck\\work",
      ANTHROPIC_API_KEY: "leaked-key",
    },
    title: "QuotaDeck - Work",
  };
  const homeDirectory = "C:\\Users\\Ada";

  it("embeds the profile environment in the tab script", () => {
    const script = buildWindowsProfileScript(spec, homeDirectory);
    expect(script).toContain(
      "$env:CLAUDE_CONFIG_DIR = 'C:\\Users\\Ada\\.quotadeck\\work'",
    );
    expect(script).toContain(
      "$env:PATH = 'C:\\tools;C:\\Users\\Ada\\AppData\\Roaming\\npm'",
    );
    expect(script).toContain(
      "Remove-Item -LiteralPath Env:\\ANTHROPIC_API_KEY -ErrorAction SilentlyContinue",
    );
    expect(script).toContain("& 'claude' '--settings'");
  });

  it("skips billing-override unsets when no profile root is configured", () => {
    const script = buildWindowsProfileScript(
      {
        ...spec,
        environment: { Path: "C:\\tools" },
      },
      homeDirectory,
    );
    expect(script).not.toContain("Remove-Item");
    expect(script).not.toContain("$env:CLAUDE_CONFIG_DIR");
    expect(script).toContain("$env:PATH = 'C:\\tools'");
  });

  it("launches wt.exe with the self-contained encoded script rather than raw env inheritance", () => {
    const candidates = createTerminalLaunchCandidates(
      "win32",
      spec,
      homeDirectory,
    );
    const windowsTerminal = candidates.find(
      (candidate) => candidate.executable === "wt.exe",
    );
    const fallback = candidates.find(
      (candidate) => candidate.executable === "powershell.exe",
    );
    expect(windowsTerminal).toBeDefined();
    expect(fallback).toBeDefined();

    // wt.exe must relaunch through powershell.exe with the encoded script so the
    // new tab does not inherit the already-running Windows Terminal environment.
    expect(windowsTerminal!.args).toContain("powershell.exe");
    const encodedIndex = windowsTerminal!.args.indexOf("-EncodedCommand");
    expect(encodedIndex).toBeGreaterThan(-1);
    const encoded = windowsTerminal!.args[encodedIndex + 1];
    // Both terminals carry the identical self-contained script.
    expect(fallback!.args).toContain(encoded);

    const decoded = decodePowerShellEncodedCommand(encoded);
    expect(decoded).toContain(
      "$env:CLAUDE_CONFIG_DIR = 'C:\\Users\\Ada\\.quotadeck\\work'",
    );
    expect(decoded).toContain(
      "Remove-Item -LiteralPath Env:\\ANTHROPIC_API_KEY -ErrorAction SilentlyContinue",
    );
    // The raw CLI must not ride on wt.exe's own argument list anymore.
    expect(windowsTerminal!.args).not.toContain("--settings");
  });
});

describe("Linux terminal early-exit detection", () => {
  const spec: TerminalProfileSpec = {
    provider: "codex",
    executable: "codex",
    args: ["login"],
    environment: { PATH: "/usr/bin", CODEX_HOME: "/home/ada/.quotadeck/login" },
    title: "QuotaDeck - Login",
  };

  it("gives every Linux candidate a grace window to fail on incompatible args", () => {
    const candidates = createTerminalLaunchCandidates(
      "linux",
      spec,
      "/home/ada",
    );
    expect(candidates).not.toHaveLength(0);
    for (const candidate of candidates) {
      expect(candidate.earlyExitGraceMs).toBe(
        LINUX_TERMINAL_EARLY_EXIT_GRACE_MS,
      );
      expect(candidate.waitForExit).toBeUndefined();
    }
  });

  it("does not attach a grace window to macOS or Windows candidates", () => {
    const macCandidates = createTerminalLaunchCandidates(
      "darwin",
      spec,
      "/Users/ada",
    );
    const windowsCandidates = createTerminalLaunchCandidates(
      "win32",
      spec,
      "C:\\Users\\Ada",
    );
    for (const candidate of [...macCandidates, ...windowsCandidates]) {
      expect(candidate.earlyExitGraceMs).toBeUndefined();
    }
  });
});
