import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

// Windows resolves bare command names against PATHEXT extensions, so the CLI
// shims that `npm i -g` writes (claude.cmd / claude.ps1) never resolve when
// execFile is asked for a bare "claude" (libuv only tries the .EXE), and an
// explicitly selected .cmd is rejected with EINVAL after the CVE-2024-27980
// hardening. This resolver mirrors the platform lookup so probing and launch
// preflight can reach those shims via an absolute path and a safe invocation.

const DEFAULT_WINDOWS_PATHEXT = [".COM", ".EXE", ".BAT", ".CMD"];

export interface CliInvocation {
  /** Executable handed to execFile/spawn (cmd.exe/powershell.exe for shims). */
  file: string;
  /** Fully-formed argument vector, ready to hand to execFile/spawn. */
  args: string[];
  /**
   * Set when `file`/`args` encode a raw cmd.exe command line that Node must not
   * re-quote. The .cmd/.bat wrap relies on cmd.exe's own quote handling, so the
   * caller must forward this flag as `windowsVerbatimArguments` to execFile.
   */
  windowsVerbatimArguments?: boolean;
}

// cmd.exe with `/s` strips the outermost quote pair of the `/c` string, so a
// shim path that contains a space (the default npm-global dir under a profile
// like `C:\Users\John Doe\AppData\Roaming\npm`) or an `&` is mangled unless the
// whole command line is wrapped in an extra quote and passed verbatim. Quote
// every token that carries whitespace or a cmd metacharacter, doubling any
// embedded quote, so the shim and its arguments survive that stripping.
function quoteCmdArgument(value: string): string {
  if (value !== "" && !/[\s"&|<>^()]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function windowsPathExtensions(environment: NodeJS.ProcessEnv): string[] {
  const extensions = (environment.PATHEXT ?? DEFAULT_WINDOWS_PATHEXT.join(";"))
    .split(";")
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean);
  return extensions.length > 0
    ? extensions
    : DEFAULT_WINDOWS_PATHEXT.map((extension) => extension.toLowerCase());
}

async function resolveWindowsExecutable(
  command: string,
  environment: NodeJS.ProcessEnv,
): Promise<string | null> {
  const extensions = windowsPathExtensions(environment);
  const hasPathextExtension = (target: string) =>
    extensions.includes(path.win32.extname(target).toLowerCase());

  // Explicit path: honour it directly, appending a PATHEXT extension only when
  // the caller omitted one (a selected claude.ps1 already carries its suffix).
  // Filesystem probes use the host path module so injected-platform tests can
  // exercise this lookup on posix hosts; on Windows `path` is `path.win32`.
  if (path.win32.isAbsolute(command) || /[\\/]/.test(command)) {
    const base = path.resolve(command);
    if (hasPathextExtension(base) && (await fileExists(base))) return base;
    for (const extension of extensions) {
      const candidate = base + extension;
      if (await fileExists(candidate)) return candidate;
    }
    if (path.win32.extname(base) && (await fileExists(base))) return base;
    return null;
  }

  // Bare name: walk the augmented PATH the same way the OS loader would.
  const pathKey = Object.keys(environment).find(
    (key) => key.toLowerCase() === "path",
  );
  const directories =
    (pathKey ? environment[pathKey] : undefined)?.split(";").filter(Boolean) ??
    [];
  for (const directory of directories) {
    const base = path.join(directory, command);
    if (hasPathextExtension(command) && (await fileExists(base))) return base;
    for (const extension of extensions) {
      const candidate = base + extension;
      if (await fileExists(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Resolves a provider command plus its arguments to a concrete execFile/spawn
 * invocation. On win32 the command is resolved to an absolute path via the
 * augmented PATH/PATHEXT, and .cmd/.bat/.ps1 shims are wrapped in a safe launch
 * (never an interpolated shell string). Elsewhere the bare command is returned
 * for direct execFile. Callers must forward `windowsVerbatimArguments` to the
 * child_process options so the cmd.exe wrap is not re-quoted by Node.
 */
export async function resolveCliInvocation(
  command: string,
  commandArgs: string[],
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<CliInvocation> {
  if (platform !== "win32") {
    return { file: command, args: commandArgs };
  }

  const resolved = await resolveWindowsExecutable(command, environment);
  const target = resolved ?? command;
  const extension = path.win32.extname(target).toLowerCase();

  if (extension === ".cmd" || extension === ".bat") {
    const comSpec = environment.ComSpec ?? environment.COMSPEC ?? "cmd.exe";
    const commandLine = [target, ...commandArgs]
      .map(quoteCmdArgument)
      .join(" ");
    return {
      file: comSpec,
      // The extra outer quotes are what `/s` strips back off, leaving the inner
      // quoted shim path intact.
      args: ["/d", "/s", "/c", `"${commandLine}"`],
      windowsVerbatimArguments: true,
    };
  }
  if (extension === ".ps1") {
    // powershell -File tolerates Node's normal per-argument quoting, so no
    // verbatim wrapping is needed even for paths with spaces or `&`.
    return {
      file: "powershell.exe",
      args: [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        target,
        ...commandArgs,
      ],
    };
  }
  return { file: target, args: commandArgs };
}
