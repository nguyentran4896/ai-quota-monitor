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
- Codex uses the official `account/read` and `account/rateLimits/read` app-server
  methods, with a clearly labeled last-session fallback.
- The renderer never receives filesystem paths, provider command output, or raw
  authentication material.

## Platform support

| Platform                      | Runtime and switching                     | Distribution                | Verification status                                   |
| ----------------------------- | ----------------------------------------- | --------------------------- | ----------------------------------------------------- |
| Windows 10/11 x64             | Windows Terminal with PowerShell fallback | NSIS installer              | Implemented and locally verified                      |
| macOS Intel and Apple silicon | Codex profiles; current Claude account    | DMG and ZIP                 | Implemented; native GitHub runner is the release gate |
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

```sh
pnpm install --frozen-lockfile
pnpm dev
```

QuotaDeck augments the GUI application's process path with common npm, pnpm,
Homebrew, native CLI, and user-local binary directories. It never modifies the
user's shell profile or global environment.

## Quality and packaging

```sh
pnpm check
pnpm package:win
pnpm package:mac
pnpm package:linux
```

Native installers must be produced on the corresponding operating-system runner;
macOS signing and notarization cannot be performed from Windows or Linux. Tag
builds remain artifact-only until the repository variable `RELEASES_ENABLED` is
set to `true` and signing secrets are configured. See
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
- Removing a managed profile requires a native confirmation and moves its entire
  app-owned directory to the system Trash or Recycle Bin. Built-in profiles
  cannot be removed.
- Missing provider data remains unknown instead of being estimated.

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
