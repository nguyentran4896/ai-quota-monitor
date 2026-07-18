# Platform support contract

QuotaDeck's supported platforms are Windows, macOS, and mainstream desktop Linux.
Support means the application can discover official CLIs, isolate managed account
homes, collect provider-supported quota, launch an interactive terminal, keep a
reachable desktop lifecycle, and produce a native artifact.

## Compatibility matrix

| Capability         | Windows                             | macOS                            | Linux                               |
| ------------------ | ----------------------------------- | -------------------------------- | ----------------------------------- |
| Profile storage    | Claude and Codex managed homes      | Codex homes; current Claude only | Claude and Codex managed homes      |
| Claude collector   | Packaged runtime + CJS              | Packaged runtime + CJS           | Packaged runtime + CJS              |
| Codex app-server   | Direct child process                | Direct child process             | Direct child process                |
| Interactive launch | Windows Terminal, PowerShell        | Terminal.app                     | Six terminal candidates             |
| Close behavior     | Tray when available, otherwise exit | Dock + tray                      | Tray when available, otherwise exit |
| Artifact           | NSIS `.exe`                         | `.dmg` and `.zip`                | `.AppImage` and `.deb`              |
| CI runner          | `windows-latest`                    | `macos-latest`                   | `ubuntu-latest`                     |

Release architecture targets are Windows x64, macOS x64 and arm64, and Linux x64.
Additional Linux package formats and Windows on ARM can be added after native user
testing establishes demand.

## macOS Claude credential limitation

Anthropic's official
[authentication documentation](https://code.claude.com/docs/en/authentication#credential-management)
states that macOS credentials are stored in Keychain, while `CLAUDE_CONFIG_DIR`
relocates credential files only on Windows and Linux. As a result, separate
configuration folders do not provide independent Claude subscription identities
on macOS. QuotaDeck enforces this as a capability limitation and does not create,
monitor, or launch managed Claude profiles there. It supports the current Claude
identity and separate Codex homes.

This guard can be removed only after Anthropic documents profile-scoped macOS
credentials or another supported first-party account-selection interface.

## CLI discovery

Desktop applications launched from Finder or a graphical Linux shell often do
not inherit the interactive shell's full `PATH`. QuotaDeck prepends common paths
to its child environment without changing the machine:

- Windows: `%APPDATA%\\npm`, `%LOCALAPPDATA%\\pnpm`, and `~\\.local\\bin`;
- macOS: `~/.local/bin`, `~/Library/pnpm`, `~/.bun/bin`, `/opt/homebrew/bin`, and
  `/usr/local/bin`;
- Linux: `~/.local/bin`, `~/.local/share/pnpm`, `~/.bun/bin`, `/usr/local/bin`,
  and `/usr/bin`.

If a CLI is elsewhere, launch QuotaDeck from a shell containing that path until a
future settings screen supports custom executable locations.

## Native verification policy

Pure tests validate platform descriptors, quoting, terminal candidate arguments,
profile environment isolation, and collector privacy on every CI runner. Each
pull request also typechecks, tests, and builds on all three native operating
systems.

An artifact is release-supported only after its native packaging job succeeds.
Windows Authenticode and macOS Developer ID/notarization are mandatory before the
automated workflow may publish a GitHub release. Linux artifacts are checksummed
by GitHub Releases; repository package signing is a future distribution-channel
decision.

## Known desktop variation

Linux tray support depends on the desktop's StatusNotifier/AppIndicator support.
QuotaDeck remains safe when no tray is available by exiting on close. Wayland and
X11 terminal behavior is delegated to installed terminal applications. macOS
Terminal automation may prompt for Automation permission on first use. These are
native-runner and manual release-checklist items, not reasons to handle credentials
differently.
