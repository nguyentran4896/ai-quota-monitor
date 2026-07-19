# Native Windows development

QuotaDeck's primary Windows development path runs directly on Windows. It uses
Git for Windows, the Windows build of Node.js, PowerShell, pnpm, and Electron.
WSL, Docker, a Linux VM, and Unix shell tools are not required.

Keep the checkout on a local Windows drive; NTFS is recommended. Do not open
this repository through a UNC share, Linux-mounted path, or WSL remote workspace
because npm command shells, Electron, native modules, credential storage,
terminal launching, and installer generation must be tested against the Windows
APIs that users receive.

## One-time setup

Install these native Windows applications first:

- [Git for Windows](https://git-scm.com/download/win);
- Node.js 22 or newer for Windows x64;
- Windows PowerShell 5.1, included with supported Windows versions;
- PowerShell 7, optional for the interactive terminal;
- Windows Terminal, recommended but optional.

Open a normal Windows PowerShell terminal and run:

```powershell
Set-Location C:\path\to\ai-quota-monitor
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows-setup.ps1
```

The setup script fails if it detects WSL interop or a remote/UNC checkout. It
then verifies native Git and Node.js, activates the exact `pnpm` version from
`package.json` through Corepack in `%APPDATA%\npm`, installs the frozen lockfile,
and runs the full validation suite. It does not modify WSL or install a Linux
toolchain.

The committed commands deliberately invoke the built-in `powershell.exe` so the
same automation entry point exists on every supported Windows 10/11 machine.
You may launch those commands from either Windows PowerShell or PowerShell 7.

Use `-SkipCheck` only when refreshing an already verified installation:

```powershell
.\scripts\windows-setup.ps1 -SkipCheck
```

## Daily commands

```powershell
# Confirm that this terminal is native and correctly configured.
pnpm windows:doctor

# Start Electron and the renderer development server.
pnpm windows:dev

# Run formatting, typechecking, all tests, and production builds.
pnpm windows:check

# Build an unsigned Windows x64 NSIS inspection installer.
pnpm windows:package
```

The regular `pnpm dev`, `pnpm check`, and `pnpm package:win` commands remain
available. The `windows:*` forms add a fail-fast native-environment check so an
accidental remote or WSL terminal cannot silently produce misleading results.

## Editor setup

Open the folder from Windows Explorer, Windows Terminal, or a native editor:

```powershell
code C:\path\to\ai-quota-monitor
```

The committed VS Code tasks use `powershell.exe` and `pnpm.cmd` as Windows
processes. Run **Terminal → Run Task** and choose one of the `QuotaDeck:` tasks.
Do not use **Reopen Folder in WSL** for this checkout.

## Provider CLI testing

Install the official Claude Code and Codex CLIs for Windows when exercising live
account discovery. Unit tests and production builds do not need account login.
Never place provider tokens, authentication files, transcripts, or real account
identities in the repository.

QuotaDeck discovers native commands from the Windows process `PATH` and common
Windows npm/pnpm locations. Use **CLI settings** inside the app if an official
CLI is installed elsewhere. The selected absolute path remains in the Electron
main process.

## Troubleshooting

- If `pnpm` is missing in a new terminal, close and reopen the terminal so the
  existing `%APPDATA%\npm` user path is refreshed, then run the setup script.
- If script execution is restricted, use the complete `powershell.exe
-ExecutionPolicy Bypass -File ...` setup command above. It changes policy only
  for that process.
- If native dependency installation becomes inconsistent, remove
  `node_modules` using Windows Explorer or PowerShell and rerun the setup script;
  keep `pnpm-lock.yaml` unchanged.
- If the doctor reports WSL interop, close that terminal and start PowerShell
  directly from Windows Terminal or the Start menu.
- Public installers must still use the protected GitHub release workflow with
  Authenticode signing. `pnpm windows:package` is for local inspection only.
