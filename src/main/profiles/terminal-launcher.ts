import {
  PROVIDER_BILLING_OVERRIDES,
  PROVIDER_CONFIG_VARIABLE,
} from "./provider-environment-policy";
import type { ProviderId } from "../../shared/contracts";
import {
  encodePowerShellCommand,
  escapeAppleScriptString,
  quotePosix,
  quotePowerShellLiteral,
} from "./shell-quoting";

export interface TerminalProfileSpec {
  provider: ProviderId;
  executable: string;
  args: string[];
  environment: NodeJS.ProcessEnv;
  title: string;
}

export interface TerminalLaunchCandidate {
  executable: string;
  args: string[];
  environment: NodeJS.ProcessEnv;
  cwd: string;
  waitForExit?: boolean;
  // When set, a spawned terminal must survive this grace window before its
  // launch counts as a success. An early nonzero exit inside the window is
  // treated as a failure so the candidate loop advances to the next terminal.
  earlyExitGraceMs?: number;
}

// Linux terminals report a successful spawn even when they immediately reject
// incompatible arguments (for example x-terminal-emulator rejecting -T/-e), so
// give each candidate a short window to fail before declaring victory.
export const LINUX_TERMINAL_EARLY_EXIT_GRACE_MS = 1_500;

export function buildPosixProfileCommand(
  spec: TerminalProfileSpec,
  homeDirectory: string,
): string {
  const profileVariable = PROVIDER_CONFIG_VARIABLE[spec.provider];
  const profileRoot = spec.environment[profileVariable];
  const variablesToUnset = profileRoot
    ? PROVIDER_BILLING_OVERRIDES[spec.provider]
    : [];
  const environmentArguments = variablesToUnset.flatMap((variable) => [
    "-u",
    quotePosix(variable),
  ]);
  if (spec.environment.PATH)
    environmentArguments.push(quotePosix(`PATH=${spec.environment.PATH}`));
  if (profileRoot)
    environmentArguments.push(quotePosix(`${profileVariable}=${profileRoot}`));

  const command = [
    "env",
    ...environmentArguments,
    quotePosix(spec.executable),
    ...spec.args.map(quotePosix),
  ].join(" ");
  return `cd -- ${quotePosix(homeDirectory)} && exec ${command}`;
}

export function buildWindowsProfileScript(
  spec: TerminalProfileSpec,
  homeDirectory: string,
): string {
  const profileVariable = PROVIDER_CONFIG_VARIABLE[spec.provider];
  const profileRoot = spec.environment[profileVariable];
  // Windows preserves PATH under its original casing (often "Path"), so resolve
  // the key case-insensitively before embedding the augmented search path.
  const pathKey = Object.keys(spec.environment).find(
    (key) => key.toLowerCase() === "path",
  );
  const pathValue = pathKey ? spec.environment[pathKey] : undefined;
  const variablesToUnset = profileRoot
    ? PROVIDER_BILLING_OVERRIDES[spec.provider]
    : [];

  // Embed the profile environment inside the tab's own script so per-profile
  // isolation survives even when wt.exe hands the tab to an already-running
  // Windows Terminal process whose inherited environment would otherwise run
  // the session against the default account.
  const statements = [
    `Set-Location -LiteralPath ${quotePowerShellLiteral(homeDirectory)}`,
  ];
  for (const variable of variablesToUnset)
    statements.push(
      `Remove-Item -LiteralPath Env:\\${variable} -ErrorAction SilentlyContinue`,
    );
  if (pathValue)
    statements.push(`$env:PATH = ${quotePowerShellLiteral(pathValue)}`);
  if (profileRoot)
    statements.push(
      `$env:${profileVariable} = ${quotePowerShellLiteral(profileRoot)}`,
    );
  statements.push(
    `& ${quotePowerShellLiteral(spec.executable)} ${spec.args.map(quotePowerShellLiteral).join(" ")}`.trim(),
  );
  return statements.join("; ");
}

export function createTerminalLaunchCandidates(
  platform: NodeJS.Platform,
  spec: TerminalProfileSpec,
  homeDirectory: string,
): TerminalLaunchCandidate[] {
  const common = { environment: spec.environment, cwd: homeDirectory };

  if (platform === "win32") {
    // Both terminals run the same self-contained encoded script so the profile
    // environment no longer depends on spawn-env inheritance, which wt.exe drops
    // when it hands the new tab to an already-running Windows Terminal process.
    const encodedScript = encodePowerShellCommand(
      buildWindowsProfileScript(spec, homeDirectory),
    );
    return [
      {
        executable: "wt.exe",
        args: [
          "new-tab",
          "--startingDirectory",
          homeDirectory,
          "--title",
          spec.title,
          "powershell.exe",
          "-NoLogo",
          "-NoExit",
          "-EncodedCommand",
          encodedScript,
        ],
        ...common,
      },
      {
        executable: "powershell.exe",
        args: ["-NoLogo", "-NoExit", "-EncodedCommand", encodedScript],
        ...common,
      },
    ];
  }

  if (platform === "darwin") {
    const command = buildPosixProfileCommand(spec, homeDirectory);
    const script = `tell application "Terminal" to do script "${escapeAppleScriptString(command)}"`;
    return [
      {
        executable: "osascript",
        args: ["-e", script],
        waitForExit: true,
        ...common,
      },
    ];
  }

  if (platform === "linux") {
    // Each candidate spawns detached, so pair it with the early-exit grace
    // window that turns an immediate nonzero exit into a launch failure.
    const linuxCommon = {
      ...common,
      earlyExitGraceMs: LINUX_TERMINAL_EARLY_EXIT_GRACE_MS,
    };
    return [
      {
        executable: "x-terminal-emulator",
        args: ["-T", spec.title, "-e", spec.executable, ...spec.args],
        ...linuxCommon,
      },
      {
        executable: "gnome-terminal",
        args: ["--title", spec.title, "--", spec.executable, ...spec.args],
        ...linuxCommon,
      },
      {
        executable: "konsole",
        args: [
          "--new-tab",
          "-p",
          `tabtitle=${spec.title}`,
          "-e",
          spec.executable,
          ...spec.args,
        ],
        ...linuxCommon,
      },
      {
        executable: "kitty",
        args: ["--title", spec.title, spec.executable, ...spec.args],
        ...linuxCommon,
      },
      {
        executable: "alacritty",
        args: ["--title", spec.title, "-e", spec.executable, ...spec.args],
        ...linuxCommon,
      },
      {
        executable: "xterm",
        args: ["-T", spec.title, "-e", spec.executable, ...spec.args],
        ...linuxCommon,
      },
    ];
  }

  return [];
}
