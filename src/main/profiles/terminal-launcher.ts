import {
  PROVIDER_BILLING_OVERRIDES,
  PROVIDER_CONFIG_VARIABLE,
} from "./provider-environment-policy";
import type { ProviderId } from "../../shared/contracts";
import {
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
}

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

export function createTerminalLaunchCandidates(
  platform: NodeJS.Platform,
  spec: TerminalProfileSpec,
  homeDirectory: string,
): TerminalLaunchCandidate[] {
  const common = { environment: spec.environment, cwd: homeDirectory };

  if (platform === "win32") {
    const powerShellCommand = [
      `Set-Location -LiteralPath ${quotePowerShellLiteral(homeDirectory)}`,
      `& ${quotePowerShellLiteral(spec.executable)} ${spec.args.map(quotePowerShellLiteral).join(" ")}`.trim(),
    ].join("; ");
    return [
      {
        executable: "wt.exe",
        args: [
          "new-tab",
          "--startingDirectory",
          homeDirectory,
          "--title",
          spec.title,
          spec.executable,
          ...spec.args,
        ],
        ...common,
      },
      {
        executable: "powershell.exe",
        args: ["-NoLogo", "-NoExit", "-Command", powerShellCommand],
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
    return [
      {
        executable: "x-terminal-emulator",
        args: ["-T", spec.title, "-e", spec.executable, ...spec.args],
        ...common,
      },
      {
        executable: "gnome-terminal",
        args: ["--title", spec.title, "--", spec.executable, ...spec.args],
        ...common,
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
        ...common,
      },
      {
        executable: "kitty",
        args: ["--title", spec.title, spec.executable, ...spec.args],
        ...common,
      },
      {
        executable: "alacritty",
        args: ["--title", spec.title, "-e", spec.executable, ...spec.args],
        ...common,
      },
      {
        executable: "xterm",
        args: ["-T", spec.title, "-e", spec.executable, ...spec.args],
        ...common,
      },
    ];
  }

  return [];
}
