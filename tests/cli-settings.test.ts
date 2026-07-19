import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { CliSettingsStore } from "../src/main/settings/cli-settings-store";
import {
  parseProviderCliVersion,
  probeProviderCommand,
} from "../src/main/settings/cli-probe";
import { resolveCliInvocation } from "../src/main/settings/resolve-cli-command";

const execFileAsync = promisify(execFile);
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

describe("resolveCliInvocation", () => {
  const windowsEnv = (directory: string): NodeJS.ProcessEnv => ({
    Path: directory,
    PATHEXT: ".COM;.EXE;.BAT;.CMD",
    ComSpec: "C:\\Windows\\System32\\cmd.exe",
  });

  it("passes bare commands straight through off Windows", async () => {
    await expect(
      resolveCliInvocation(
        "claude",
        ["--version"],
        { PATH: "/usr/bin" },
        "linux",
      ),
    ).resolves.toEqual({ file: "claude", args: ["--version"] });
  });

  it("wraps a resolved .cmd shim in a verbatim cmd.exe command line", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-resolve-cmd-"),
    );
    temporaryDirectories.push(directory);
    const shim = path.join(directory, "claude.cmd");
    await writeFile(shim, "@echo 2.1.0\n", "utf8");

    await expect(
      resolveCliInvocation(
        "claude",
        ["--version"],
        windowsEnv(directory),
        "win32",
      ),
    ).resolves.toEqual({
      file: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", `"${shim} --version"`],
      windowsVerbatimArguments: true,
    });
  });

  it("quotes a shim path with spaces and metacharacters for cmd.exe /s", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-resolve-cmd space & co-"),
    );
    temporaryDirectories.push(directory);
    const shim = path.join(directory, "claude.cmd");
    await writeFile(shim, "@echo 2.1.0\n", "utf8");

    // The whole command line is wrapped in an extra quote and the shim path is
    // itself quoted, so cmd.exe /s strips only the outer pair and the space in
    // the directory name does not split the command.
    await expect(
      resolveCliInvocation(
        "claude",
        ["--version"],
        windowsEnv(directory),
        "win32",
      ),
    ).resolves.toEqual({
      file: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", `""${shim}" --version"`],
      windowsVerbatimArguments: true,
    });
  });

  it("resolves a bare name to an absolute .exe for direct execFile", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-resolve-exe-"),
    );
    temporaryDirectories.push(directory);
    const executable = path.join(directory, "codex.exe");
    await writeFile(executable, "binary", "utf8");

    await expect(
      resolveCliInvocation(
        "codex",
        ["--version"],
        windowsEnv(directory),
        "win32",
      ),
    ).resolves.toEqual({ file: executable, args: ["--version"] });
  });

  it("invokes an explicitly selected .ps1 shim through powershell", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-resolve-ps1-"),
    );
    temporaryDirectories.push(directory);
    const shim = path.join(directory, "claude.ps1");
    await writeFile(shim, "Write-Output '2.1.0'\n", "utf8");

    await expect(
      resolveCliInvocation(shim, ["--version"], windowsEnv(directory), "win32"),
    ).resolves.toEqual({
      file: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        shim,
        "--version",
      ],
    });
  });

  it("returns the unresolved command when nothing matches on Windows", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-resolve-none-"),
    );
    temporaryDirectories.push(directory);

    await expect(
      resolveCliInvocation(
        "claude",
        ["--version"],
        windowsEnv(directory),
        "win32",
      ),
    ).resolves.toEqual({ file: "claude", args: ["--version"] });
  });

  // Guards the real-world regression: the default npm-global dir lives under the
  // Windows profile folder, which routinely contains a space (`C:\Users\John
  // Doe\AppData\Roaming\npm`). Actually execute the resolved invocation so a
  // non-verbatim `/s` quote-stripping regression cannot slip back in.
  it.runIf(process.platform === "win32")(
    "executes a .cmd shim resolved from a directory with a space and &",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "quotadeck-cmd-exec-"));
      temporaryDirectories.push(root);
      const directory = path.join(root, "John Doe & Co");
      await mkdir(directory);
      const shim = path.join(directory, "claude.cmd");
      await writeFile(
        shim,
        "@echo off\r\necho 2.1.0 (Claude Code)\r\n",
        "utf8",
      );

      const invocation = await resolveCliInvocation(
        "claude",
        ["--version"],
        { ...windowsEnv(directory), Path: directory },
        "win32",
      );
      const { stdout } = await execFileAsync(invocation.file, invocation.args, {
        windowsHide: true,
        timeout: 5_000,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      });
      expect(stdout.trim()).toBe("2.1.0 (Claude Code)");
    },
  );
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

  it("accepts absolute Windows .cmd and .ps1 shim paths", async () => {
    const dataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "quotadeck-cli-settings-"),
    );
    temporaryDirectories.push(dataDirectory);
    const store = new CliSettingsStore(dataDirectory);

    const cmdShim = path.join(dataDirectory, "claude.cmd");
    await writeFile(cmdShim, "@echo off\n", "utf8");
    await store.setCommand("claude", cmdShim);
    expect((await store.getCommands()).claude).toBe(cmdShim);

    const ps1Shim = path.join(dataDirectory, "codex.ps1");
    await writeFile(ps1Shim, "Write-Output '0.139.0'\n", "utf8");
    await store.setCommand("codex", ps1Shim);
    expect((await store.getCommands()).codex).toBe(ps1Shim);
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
