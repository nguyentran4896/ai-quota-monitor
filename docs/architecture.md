# QuotaDeck architecture

Status: accepted cross-platform baseline, 2026-07-18

## Decision

QuotaDeck is a local-first Electron, React, and TypeScript desktop application.
The same source supports Windows, macOS, and Linux while native CI runners own
their platform's packaging and signing checks.

Electron remains the appropriate first architecture because the product needs
local provider processes, isolated per-child environments, tray lifecycle,
filesystem observations, and native installers. A PWA cannot safely provide
those capabilities without adding a separately secured local daemon. Tauri may
be reconsidered if measured distribution size or idle memory becomes a product
constraint worth a second implementation language.

## Truth model

Every quota observation has one of three confidence levels:

1. **Provider-reported** — structured data emitted by an official provider client.
2. **Local observation** — connection, plan, or last-seen evidence from that client.
3. **Unavailable** — the provider has no supported machine-readable signal.

Unknown values stay unknown. Subscription limits cannot be safely inferred from
token counts because providers vary cost by model, feature, and policy.

## Process boundaries

```text
Sandboxed React renderer
        |
        | frozen, typed IPC bridge
        v
Electron main process
  |-- platform boundary: menu, tray, CLI PATH, terminal launch
  |-- Claude adapter: auth status + allow-listed status-line snapshot
  |-- Codex adapter: app-server RPC + labeled local-session fallback
  |-- profile registry: names + app-owned config roots only
  `-- release boundary: native Windows/macOS/Linux builders
```

The renderer has `nodeIntegration: false`, `contextIsolation: true`, and sandboxing
enabled. It receives normalized account snapshots and a non-sensitive runtime
platform descriptor, never provider stdout or local paths.

## Portable Claude collection

Claude status-line commands require an executable that can parse JSON without
assuming PowerShell, Python, `jq`, or a system Node.js installation. QuotaDeck
therefore invokes its packaged Electron executable with `ELECTRON_RUN_AS_NODE=1`
and a dependency-free CommonJS collector. The collector:

- accepts the official status-line document on standard input;
- validates and clamps only documented quota fields;
- atomically writes an allow-listed snapshot under the managed profile;
- discards session IDs, transcripts, workspace paths, account identity, and all
  other input fields;
- exits successfully with a non-sensitive status message if capture fails.

The Electron `runAsNode` fuse intentionally remains enabled for this helper.
Disabling it requires replacing the helper with signed native binaries for all
supported architectures.

## Profile and terminal isolation

Each supported managed profile owns one provider config root under Electron's
platform `userData` directory. Launches receive a copied process environment with
API and cloud billing overrides removed. QuotaDeck never mutates the global
environment.

Anthropic documents profile-scoped credential files only for Windows and Linux;
macOS uses a global Keychain credential. Managed Claude profiles are therefore
blocked on macOS at the UI, storage, dashboard, and launcher boundaries. The
built-in current Claude profile can still write non-secret quota observations to
QuotaDeck's data directory. QuotaDeck will not implement a Keychain swapper.

- Windows tries Windows Terminal, then the built-in PowerShell console.
- macOS asks Terminal.app to run an explicitly quoted `env` command that unsets
  billing overrides and sets only the selected profile root.
- Linux tries `x-terminal-emulator`, GNOME Terminal, Konsole, Kitty, Alacritty,
  and xterm with direct argument arrays.

The app augments only its child `PATH` with common GUI-missing locations such as
Homebrew, pnpm, npm, and `~/.local/bin`.

## Desktop lifecycle

Windows and Linux hide on close only when a tray icon was created successfully;
otherwise closing exits so the app cannot become unreachable. macOS follows the
standard Dock lifecycle and retains a native application menu. A second launch
focuses the existing instance on every platform.

## Release trust boundary

Source validation runs on Windows, macOS, and Linux. Release artifacts are built
on native runners. Public publishing is disabled by default and requires a
repository variable plus Windows signing and macOS signing/notarization secrets.
Actions are pinned to immutable commit hashes, and CodeQL and Dependabot are
enabled for the public repository.

## Explicit non-goals

- copying or renaming provider credential files;
- browser-cookie or keychain extraction;
- automatic quota rotation, prompt routing, or limit circumvention;
- a hosted service that receives subscription credentials;
- claiming cross-platform release support before native CI passes.
