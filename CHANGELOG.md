# Changelog

All notable changes to QuotaDeck are documented here. The project follows
[Semantic Versioning](https://semver.org/) and keeps an
[Unreleased](https://keepachangelog.com/en/1.1.0/) section for contributor work.

## [Unreleased]

### Added

- Cross-platform profile launching for Windows, macOS, and Linux.
- Portable Claude status-line quota collection through the packaged runtime.
- Native CI and release artifact workflows.
- Apache-2.0 licensing and open-source community documentation.
- Confirmed, recoverable removal of managed account profiles.
- Packaged-renderer and IPC sender trust enforcement.
- Bounded provider collection and Codex protocol buffering for many-account safety.
- Protected, annotated-tag release workflow with temporary Apple key handling and
  SHA-256 checksums.
- Full dependency auditing with the patched esbuild development toolchain.
- Masked provider identity, explicit authentication/billing modes, and safe
  first-launch identity verification for managed profiles.
- Fresh, stale, partial, needs-first-response, awaiting-refresh, signed-out, and
  unavailable quota states with provider-specific recommendations only.
- Persistent bounded Codex app-server monitoring with official rate-limit update
  notifications and a clearly labeled last-session fallback.
- Local CLI discovery/version status plus a main-process-only custom executable
  picker.
- Official-provider logout before optional profile removal, recoverable Trash or
  Recycle Bin deletion, and stale-registration repair.
- Keyboard-accessible switcher navigation, modal focus trapping/return, semantic
  status announcements, and reduced-motion support.
- Behavioral adversarial shell-boundary tests and fail-closed native release
  signature verification.
- Collision-resistant main-process account verification using a device-local
  HMAC key that never crosses IPC.
- Strict supported CLI ranges with normalized version-only renderer output.
- Configurable, deduplicated local quota alerts for fresh subscription data and
  per-provider official usage-verification actions.
- Exhaustive provider lifecycle registries for collection, monitoring teardown,
  and official logout.
- Native Windows development workflow with `windows-setup.ps1` and
  `windows-doctor.ps1` scripts, `windows:*` pnpm scripts, VS Code tasks, and
  `docs/windows-development.md` guidance.

### Changed

- Renamed the npm package to `quotadeck` to match the product brand.
- CLI search candidates now append after the existing PATH so user-writable
  directories can no longer shadow the official CLI.
- The Windows doctor Node.js architecture check warns on non-x64 hosts
  (including ARM64) instead of hard-failing dev and check flows.

### Fixed

- Windows `.cmd`/`.bat` CLI shims resolve through a PATHEXT-aware lookup before
  launching.
- Windows Terminal (`wt.exe`) tabs embed the profile environment so new tabs no
  longer inherit the default account.
- Linux windows keep the native title bar instead of losing all controls to an
  unsupported Window Controls Overlay.
- Linux terminal launches detect immediate nonzero exits so the remaining
  fallback candidates are tried.

### Security

- The production renderer CSP omits the development-only Vite HMR websocket
  source.

## [0.1.0] - 2026-07-18

### Added

- Local Claude Code and Codex account discovery.
- Isolated managed account profiles.
- Claude status-line and Codex app-server quota adapters.
- Windows tray application and installer.
