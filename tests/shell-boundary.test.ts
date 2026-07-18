import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { buildClaudeStatusLineCommand } from "../src/main/profiles/claude-statusline-launch";
import {
  buildPosixProfileCommand,
  createTerminalLaunchCandidates,
  type TerminalProfileSpec,
} from "../src/main/profiles/terminal-launcher";

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
