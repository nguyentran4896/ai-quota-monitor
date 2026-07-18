# Platform support contract

QuotaDeck's supported platforms are Windows 10/11 x64, macOS 12 or newer on Intel
and Apple silicon, and mainstream x64 desktop Linux.
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

If a CLI is elsewhere, open **CLI settings** and choose the official executable.
QuotaDeck validates it with `--version` and currently accepts Claude Code
`>=2.1.0 <3.0.0` and Codex `>=0.139.0 <1.0.0`. It stores the absolute location
locally and sends only availability, source, and a normalized semantic version
to the UI; unrecognized provider output is never displayed. Resetting the choice
returns discovery to the application PATH. These adapter ranges must be reviewed
when either provider ships a new major version.

## Native verification policy

Pure tests validate platform descriptors, quoting, terminal candidate arguments,
profile environment isolation, and collector privacy on every CI runner. A
behavioral shell-boundary test also executes metacharacter-heavy generated
commands through PowerShell/cmd on Windows and `/bin/sh` on macOS/Linux. Each pull
request typechecks, tests, and builds on all three native operating systems.

An artifact is release-supported only after its native packaging job succeeds.
Windows Authenticode and macOS Developer ID/notarization are mandatory before the
automated workflow may publish a GitHub release. The workflow fails closed if a
signing identity is absent and validates native signatures after packaging.
Linux artifacts are checksummed by GitHub Releases; repository package signing
is a future distribution-channel decision.

Unsigned macOS workflow artifacts are explicitly inspection-only: signing,
hardened runtime, and notarization are all disabled together. They are useful for
native smoke testing but are not safe to present as a community release.

## Known desktop variation

Linux tray support depends on the desktop's StatusNotifier/AppIndicator support.
QuotaDeck remains safe when no tray is available by exiting on close. Wayland and
X11 terminal behavior is delegated to installed terminal applications. macOS
Terminal automation may prompt for Automation permission on first use. These are
native-runner and manual release-checklist items, not reasons to handle credentials
differently.
