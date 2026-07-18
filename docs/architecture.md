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

Every account also carries a separate quota state: **Fresh**, **Stale**,
**Partial**, **Needs first response**, **Awaiting refresh**, **Signed out**, or
**Unavailable**. Freshness is based on the provider observation time, not the
dashboard render time. If a reset time has passed without a newer observation,
the account becomes **Awaiting refresh** instead of assuming the limit reset.

## Process boundaries

```text
Sandboxed React renderer
        |
        | frozen, typed IPC bridge
        v
Electron main process
  |-- platform boundary: menu, tray, CLI PATH, terminal launch
  |-- typed provider adapters: normalized account snapshots
  |   |-- Claude: auth status + allow-listed status-line snapshot
  |   `-- Codex: persistent app-server RPC + labeled session fallback
  |-- profile registry: names + masked identity + keyed verifier + owned roots
  |-- CLI settings: main-process-only executable locations + probes
  |-- alert policy: local threshold + fresh provider-reported windows only
  `-- release boundary: native Windows/macOS/Linux builders
```

The renderer has `nodeIntegration: false`, `contextIsolation: true`, and sandboxing
enabled. It receives normalized account snapshots, a non-sensitive runtime
platform descriptor, masked identities, and bounded CLI status/version strings—
never provider stdout, full identities, or local paths. IPC registration lives
outside the application entrypoint so lifecycle policy and profile actions remain
independently reviewable.

## Account identity and billing safety

Provider identity is masked before it enters the profile registry or renderer.
New managed homes begin as pending login workspaces. Before the first work
launch, QuotaDeck reads the identity through the official provider surface and
asks the user to confirm the masked value; later mismatches require a new
confirmation. The safety comparison uses an HMAC-SHA-256 verifier, not the
collision-prone display mask. Its random 32-byte device key and verifier stay in
the main process, and the verifier is stripped before a snapshot crosses IPC.
Raw email addresses are not persisted by QuotaDeck. A missing key or legacy
profile safely requires confirmation again.

Authentication and billing are modeled independently. Subscription, API-key,
and external-provider billing are never combined into one quota score. API or
external billing requires a native confirmation on every work launch. A running
terminal keeps the identity and environment it started with; switching always
creates a new process.

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

The user may select a custom official CLI executable if PATH discovery fails.
The settings store accepts only an absolute existing file, writes atomically
with user-only mode where the platform honors it, and accepts only recognized
Claude Code `>=2.1.0 <3.0.0` or Codex `>=0.139.0 <1.0.0` version output. Arbitrary
standard output and error are discarded; only a normalized semantic version or
non-sensitive status reaches the renderer.

## Provider lifecycle

Claude quota is event-driven: the status-line collector records an observation
only after a real Claude response and never generates a synthetic request.
Codex retains up to eight bounded persistent app-server connections, keyed by
`(executable, CODEX_HOME)`, and merges official rate-limit notifications.
Additional profiles use short-lived official connections during refresh so a
large profile collection cannot leave an unbounded process fleet. Connections
have timeouts and protocol-buffer limits and are stopped on logout, profile
removal, CLI changes, or application exit.

Provider collection and monitoring teardown are selected from exhaustive typed
registries. Logout uses the same provider lifecycle boundary, keeping provider
branching out of IPC policy code.

Removing a profile first offers official logout. Logout failure is
non-destructive. The profile remains registered until its app-owned directory is
successfully moved to the system Trash or Recycle Bin; a missing directory can
be repaired by removing the stale registration.

## Alerts and official verification

The alert threshold is stored locally and atomically as Off, 75%, 85%, or 95%.
Native notifications are evaluated in the main process only when a subscription
snapshot is Fresh and Provider-reported. A bounded in-memory key deduplicates each
account, quota window, reset time, and threshold. No automatic switch or provider
request follows an alert.

Account cards open fixed official HTTPS help pages from a main-process provider
allowlist. Claude users are directed to `/usage`; Codex users are directed to
**Settings → Usage**. The renderer never supplies a URL.

## Desktop lifecycle

Windows and Linux hide on close only when a tray icon was created successfully;
otherwise closing exits so the app cannot become unreachable. macOS follows the
standard Dock lifecycle and retains a native application menu. A second launch
focuses the existing instance on every platform.

## Release trust boundary

Source validation runs on Windows, macOS, and Linux. Release artifacts are built
on native runners. Manual and disabled-release builds are explicitly unsigned
and cannot access signing secrets. Unsigned macOS inspection builds also disable
hardened runtime and notarization; they are not public releases. Public
publishing is disabled by default and requires an annotated semantic-version tag
matching `package.json`, a repository variable, and approval for a protected
`release` environment containing Windows signing and macOS signing/notarization
secrets. Signed jobs force a build failure if signing is absent, then verify
Authenticode, code signatures, Gatekeeper acceptance, notarization tickets, and
package structure. Actions are pinned to immutable commit hashes, and CodeQL and
Dependabot are enabled for the public repository.

## Explicit non-goals

- copying or renaming provider credential files;
- browser-cookie or keychain extraction;
- automatic quota rotation, prompt routing, or limit circumvention;
- a hosted service that receives subscription credentials;
- claiming cross-platform release support before native CI passes.
