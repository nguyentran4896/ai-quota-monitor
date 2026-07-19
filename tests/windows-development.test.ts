import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");
const windowsIt = process.platform === "win32" ? it : it.skip;

describe("native Windows development workflow", () => {
  it("exposes documented PowerShell setup, doctor, development, and packaging commands", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const readme = await readFile(path.join(projectRoot, "README.md"), "utf8");
    const contributing = await readFile(
      path.join(projectRoot, "CONTRIBUTING.md"),
      "utf8",
    );
    const guide = await readFile(
      path.join(projectRoot, "docs", "windows-development.md"),
      "utf8",
    );
    const setup = await readFile(
      path.join(projectRoot, "scripts", "windows-setup.ps1"),
      "utf8",
    );
    const doctor = await readFile(
      path.join(projectRoot, "scripts", "windows-doctor.ps1"),
      "utf8",
    );
    const common = await readFile(
      path.join(projectRoot, "scripts", "windows-development-common.ps1"),
      "utf8",
    );
    const vscodeTasks = JSON.parse(
      await readFile(path.join(projectRoot, ".vscode", "tasks.json"), "utf8"),
    ) as { tasks: Array<{ type: string; command: string; args: string[] }> };

    expect(packageJson.scripts["windows:setup"]).toContain(
      "scripts/windows-setup.ps1",
    );
    expect(packageJson.scripts["windows:doctor"]).toContain(
      "scripts/windows-doctor.ps1",
    );
    expect(packageJson.scripts["windows:dev"]).toBe(
      "pnpm windows:doctor && pnpm dev",
    );
    expect(packageJson.scripts["windows:check"]).toBe(
      "pnpm windows:doctor && pnpm check",
    );
    expect(packageJson.scripts["windows:package"]).toContain("package:win");
    expect(readme).toContain("docs/windows-development.md");
    expect(contributing).toContain("pnpm windows:setup");
    expect(guide).toContain("Set-Location C:\\path\\to\\ai-quota-monitor");
    expect(guide).not.toMatch(/\bwsl\.exe\b|\/mnt\/[a-z]\//i);
    expect(setup).toContain("corepack");
    expect(setup).not.toMatch(/\bwsl\.exe\b|\/mnt\/[a-z]\//i);
    expect(setup).toContain("windows-development-common.ps1");
    expect(doctor).toContain("windows-development-common.ps1");
    expect(common).toContain("function Invoke-CheckedNativeCommand");
    expect(common).toContain("function Get-PinnedPnpmVersion");
    expect(setup).not.toContain("function Invoke-CheckedNativeCommand");
    expect(doctor).not.toContain("function Invoke-CheckedNativeCommand");
    expect(vscodeTasks.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "process", command: "powershell.exe" }),
        expect.objectContaining({
          type: "process",
          command: "pnpm.cmd",
          args: ["windows:dev"],
        }),
      ]),
    );
  });

  windowsIt("passes the doctor in a native Windows process", () => {
    const environment = { ...process.env };
    delete environment.WSL_DISTRO_NAME;
    delete environment.WSL_INTEROP;

    const result = spawnSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(projectRoot, "scripts", "windows-doctor.ps1"),
      ],
      { cwd: projectRoot, encoding: "utf8", env: environment },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain(
      "Native Windows development environment is ready.",
    );
  });

  windowsIt("rejects a Windows process launched through WSL interop", () => {
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(projectRoot, "scripts", "windows-doctor.ps1"),
        "-SkipPnpm",
      ],
      {
        cwd: projectRoot,
        encoding: "utf8",
        env: { ...process.env, WSL_INTEROP: "/run/WSL/1_interop" },
      },
    );

    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("WSL");
  });
});
