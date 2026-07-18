const CLAUDE_ENVIRONMENT_OVERRIDES = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
] as const;

export interface TerminalProfileSpec {
  executable: "claude" | "codex";
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

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function escapeAppleScriptString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function buildPosixProfileCommand(
  spec: TerminalProfileSpec,
  homeDirectory: string,
): string {
  const variablesToUnset =
    spec.executable === "claude"
      ? CLAUDE_ENVIRONMENT_OVERRIDES
      : ["OPENAI_API_KEY"];
  const profileVariable =
    spec.executable === "claude" ? "CLAUDE_CONFIG_DIR" : "CODEX_HOME";
  const profileRoot = spec.environment[profileVariable];
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
