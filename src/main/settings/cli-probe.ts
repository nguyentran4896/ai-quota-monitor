import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  ProviderCliStatus,
  ProviderCommandSource,
  ProviderId,
} from "../../shared/contracts";
import { createProfileEnvironment } from "../profiles/profile-environment";
import { providerInstallGuidanceFor } from "../providers/provider-install";
import { resolveCliInvocation } from "./resolve-cli-command";

const execFileAsync = promisify(execFile);

const supportedVersions = {
  claude: { minimum: [2, 1, 0] as const, major: 2 },
  codex: { minimum: [0, 139, 0] as const, major: 0 },
};

function compareVersion(
  version: readonly [number, number, number],
  minimum: readonly [number, number, number],
): number {
  for (let index = 0; index < version.length; index += 1) {
    const difference = version[index]! - minimum[index]!;
    if (difference !== 0) return difference;
  }
  return 0;
}

export function parseProviderCliVersion(
  provider: ProviderId,
  output: string,
): { version: string; compatible: boolean } | null {
  const line = output.trim();
  if (!line || line.length > 160 || /[\u0000-\u001f\u007f]/.test(line)) {
    return null;
  }
  const pattern =
    provider === "claude"
      ? /^(?:claude(?: code)?\s+)?v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:\s+\(Claude Code\))?$/i
      : /^(?:codex(?:-cli)?\s+)?v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/i;
  const match = line.match(pattern);
  if (!match) return null;
  const version = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ] as const;
  if (!version.every(Number.isSafeInteger)) return null;
  const support = supportedVersions[provider];
  return {
    version: version.join("."),
    compatible:
      version[0] === support.major &&
      compareVersion(version, support.minimum) >= 0,
  };
}

export async function probeProviderCommand(
  provider: ProviderId,
  command: string,
  source: ProviderCommandSource,
): Promise<ProviderCliStatus> {
  const providerName = provider === "claude" ? "Claude Code" : "Codex";
  const installGuidance = providerInstallGuidanceFor(provider);
  try {
    // Resolve against the same augmented PATH the launcher uses so npm/pnpm
    // .cmd shims (and explicitly selected shims) are reachable on Windows.
    const environment = createProfileEnvironment(provider, null);
    const invocation = await resolveCliInvocation(
      command,
      ["--version"],
      environment,
    );
    const { stdout, stderr } = await execFileAsync(
      invocation.file,
      invocation.args,
      {
        env: environment,
        timeout: 5_000,
        windowsHide: true,
        maxBuffer: 64_000,
        windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      },
    );
    const rawLine = `${stdout}${stderr}`.trim().split(/\r?\n/, 1)[0] ?? "";
    const parsed = parseProviderCliVersion(provider, rawLine);
    return {
      provider,
      source,
      installGuidance,
      callable: true,
      compatible: parsed?.compatible ?? false,
      version: parsed?.version ?? null,
      message: !parsed
        ? `${providerName} ran, but its version output was not recognized. Use an official supported standalone CLI.`
        : !parsed.compatible
          ? `${providerName} ${parsed.version} is outside QuotaDeck's supported range. Update the official CLI.`
          : source === "custom"
            ? `${providerName} ${parsed.version} is supported from the selected executable.`
            : `${providerName} ${parsed.version} is supported on the application PATH.`,
    };
  } catch {
    return {
      provider,
      source,
      installGuidance,
      callable: false,
      compatible: false,
      version: null,
      message: `${providerName} is not callable. Install its official standalone CLI or choose its executable in Settings.`,
    };
  }
}
