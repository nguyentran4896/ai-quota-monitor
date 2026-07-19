# QuotaDeck

QuotaDeck is an open-source, local-first desktop companion for monitoring Claude
Code and OpenAI Codex subscription quota across multiple accounts. It keeps each
managed account in an isolated provider home and opens the provider's official
login or work session without copying credentials.

The application is independent software and is not affiliated with Anthropic or
OpenAI.

## Why local-first

Personal subscription quota is exposed through local provider clients rather
than a complete hosted API. QuotaDeck therefore reads the strongest supported
signal available on the user's computer:

- Claude managed profiles use the official status-line JSON emitted after a
  response. A portable collector stores only five-hour/seven-day percentages,
  reset times, observation time, and CLI version.
- Codex keeps a bounded pool of official app-server connections, reads
  `account/read` and `account/rateLimits/read`, consumes rate-limit update
  notifications, and uses short-lived official connections beyond the retained
  pool. A clearly labeled last-session fallback appears only when the app-server
  is unavailable.
- Cards show masked identity, authentication and billing modes, source time, and
  an explicit freshness state. Passed reset times become **Awaiting refresh**;
  they never imply that quota returned to zero.
- Each card links to fixed official usage instructions (`/usage` for Claude Code
  or **Settings → Usage** for Codex). Optional local alerts fire only for fresh,
  provider-reported subscription windows at 75%, 85%, or 95% used.
- The renderer never receives filesystem paths, provider command output, or raw
  authentication material.

## Platform support

| Platform                      | Runtime and switching                     | Distribution                | Verification status                                   |
| ----------------------------- | ----------------------------------------- | --------------------------- | ----------------------------------------------------- |
| Windows 10/11 x64             | Windows Terminal with PowerShell fallback | NSIS installer              | Implemented and locally verified                      |
| macOS 12+ Intel/Apple silicon | Codex profiles; current Claude account    | DMG and ZIP                 | Implemented; native GitHub runner is the release gate |
| Linux x64                     | Common freedesktop terminal emulators     | AppImage and Debian package | Implemented; native GitHub runner is the release gate |

macOS and Linux are not claimed as release-verified until the committed native
CI workflow succeeds after this source is pushed to GitHub. See
[platform support](docs/platform-support.md) for exact behavior and limitations.

Claude Code currently stores subscription credentials in one global macOS
Keychain entry. QuotaDeck therefore disables managed Claude profiles on macOS
instead of swapping or extracting that credential. The current Claude account can
still be launched and monitored; independent Codex profiles remain supported.

## Run from source

Requirements:

- Node.js 22 or newer;
- pnpm 11;
- the official Claude Code and/or Codex standalone CLI on `PATH`.

### Native Windows development

Windows development runs directly in PowerShell from a checkout on a Windows
drive. It does not require WSL, Docker, or Unix shell tools. The one-time setup
also creates a persistent user-level `pnpm` shim instead of depending on an
editor's bundled runtime:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows-setup.ps1
pnpm windows:dev
```

Use `pnpm windows:doctor`, `pnpm windows:check`, and
`pnpm windows:package` for environment verification, the full quality suite, and
a local Windows installer. See the complete
[native Windows development guide](docs/windows-development.md).

### Other native platforms

```sh
pnpm install --frozen-lockfile
pnpm dev
```

QuotaDeck augments the GUI application's process path with common npm, pnpm,
Homebrew, native CLI, and user-local binary directories. If discovery fails,
**CLI settings** lets the user choose an existing executable for this device.
The absolute path stays in the main process and never reaches the renderer.
QuotaDeck never modifies the user's shell profile or global environment.
The current compatibility gate accepts Claude Code `>=2.1.0 <3.0.0` and Codex
`>=0.139.0 <1.0.0`; unknown output is discarded instead of shown in the UI.

## Quality and packaging

```sh
pnpm check
pnpm audit
pnpm package:win
pnpm package:mac
pnpm package:linux
```

Native installers must be produced on the corresponding operating-system runner;
macOS signing and notarization cannot be performed from Windows or Linux. Tag
and manual builds remain unsigned workflow artifacts until the repository
variable `RELEASES_ENABLED` is set to `true`, an annotated version tag matches
`package.json`, and the protected `release` environment supplies signing
secrets. See
[the release guide](docs/releasing.md).

## Security boundary

- One app-owned `CLAUDE_CONFIG_DIR` or `CODEX_HOME` is created per managed
  profile. Provider login owns the credential files inside it.
- Inherited API billing and cloud-provider overrides are removed from managed
  subscription processes.
- Claude's status-line collector runs through the packaged Electron runtime on
  all three platforms and persists an allow-listed schema only.
- Subprocesses use argument arrays. Shell commands are limited to the platform
  terminal boundary and quote app-controlled paths.
- Switching is explicit. QuotaDeck never performs automatic account failover or
  quota-evasion routing.
- Removing a managed profile requires a native confirmation. The user can ask
  the official provider to log out first or deliberately remove only local
  state; QuotaDeck then moves the app-owned directory to the system Trash or
  Recycle Bin. Built-in profiles cannot be removed.
- Missing provider data remains unknown instead of being estimated.
- Account confirmation uses a device-local keyed identity verifier. The raw
  identity and verifier key never cross into the renderer.
- Native quota notifications are local, deduplicated per reset window, and never
  generated from stale, inferred, API-billed, or external-provider data.

Please report vulnerabilities through the process in [SECURITY.md](SECURITY.md)
and never attach provider tokens or full session logs.

## Open-source project

QuotaDeck is licensed under [Apache-2.0](LICENSE), a permissive license with an
explicit patent grant. The package remains marked `private` only to prevent
accidental publication to the npm registry; it does not restrict source use or
distribution.

Read [CONTRIBUTING.md](CONTRIBUTING.md), [the code of conduct](CODE_OF_CONDUCT.md),
and [governance](GOVERNANCE.md) before contributing. Architecture and provider
evidence live in [docs/architecture.md](docs/architecture.md) and
[docs/research/provider-quota-and-auth.md](docs/research/provider-quota-and-auth.md).
Planned milestones are tracked in [ROADMAP.md](ROADMAP.md).
