# QuotaDeck improvement pass — verification & handoff

Branch: `codex/managed-profile-lifecycle-and-ux` (10 commits ahead of `main`).
Not pushed or merged — manual Windows acceptance (below) must pass first.

## What changed, by item

| #   | Item                                                                                                                                    | Key files                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Explicit managed-profile lifecycle; onboarding dead-end fixed; Claude auth states split; launch blocked until verified                  | `shared/contracts.ts`, `main/providers/snapshot-policy.ts`, `provider-snapshot.ts`, `claude-auth.ts`, `renderer/App.tsx` |
| 2   | Switcher usable 1040→1440px; functional Ctrl+K; dead breakpoint removed                                                                 | `renderer/styles.css`, `renderer/App.tsx`                                                                                |
| 3   | Normalize/dedupe labels within a provider; rename; unambiguous confirmations; legacy dupes still loadable                               | `main/profiles/profile-store.ts`, `profile-launch-safety.ts`, `ipc/register-ipc-handlers.ts`                             |
| 4   | Long-label/metadata layout no longer overlaps card controls                                                                             | `renderer/styles.css`                                                                                                    |
| 5   | Contextual, dismissible, account-identifying toast region                                                                               | `renderer/App.tsx`, `renderer/styles.css`                                                                                |
| 6   | Accounts becomes a real management destination (view routing, aria-current, per-account setup/verify/launch/rename/remove)              | `renderer/App.tsx`, `renderer/styles.css`                                                                                |
| 7   | CLI settings grounded in official Windows install docs; recheck/install actions; exe/cmd/bat/ps1 picker filters                         | `main/providers/provider-install.ts`, `settings/cli-probe.ts`, `ipc/register-ipc-handlers.ts`, `renderer/App.tsx`        |
| 8   | Alert-threshold preference saves optimistically, decoupled from quota refresh                                                           | `renderer/App.tsx`                                                                                                       |
| 9   | Accessibility/readability: distinct status dots, roving tabindex, keyshortcuts, richer names, font sizes, forced-colors, reduced-motion | `renderer/App.tsx`, `renderer/styles.css`                                                                                |
| 10  | Large collections: search, provider/status filters, sort, pin/favorite, recently-used, bounded scrolling                                | `renderer/App.tsx`, `renderer/account-preferences.ts`, `renderer/styles.css`                                             |
| 11  | Regression coverage + documented Electron visual/manual smoke                                                                           | `tests/*`, `docs/manual-smoke.md`                                                                                        |
| 12  | This report                                                                                                                             | `docs/handoff.md`                                                                                                        |

## Test suite

- `pnpm windows:check` → **exit 0** (doctor + format:check + typecheck + **149 tests** + build).
- New/expanded specs: `account-preferences.test.ts`, `accounts-destination.test.tsx`
  (14-account scaling, search, provider/status filters, pin persistence &
  ordering, launch-records-recent), `cli-settings.test.ts` (install guidance +
  Store-app caveat), `responsive-layout.test.ts` (bounded scroll, reduced-motion,
  forced-colors), plus lifecycle/rename/toast/optimistic-save/48-char-label
  cases in `App.test.tsx`.

## Scenarios verified automatically

New managed profile → "Set up this account"; signed-out / cli-missing /
timeout / malformed distinct states; launch blocked until verified; Ctrl+K
focus; same-provider dedupe + rename + legacy dupes; 48-char Unicode label
layout; toast identity + dismissal; optimistic threshold save; Accounts
navigation + search + filters + pin ordering + launch-records-recent; install
guidance shown when a CLI is missing.

## Security invariants (held)

Local-first; provider-owned credentials in isolated `CLAUDE_CONFIG_DIR` /
`CODEX_HOME`; no raw tokens, filesystem paths, or raw command output cross to
the renderer (CLI validation surfaces curated sentences only); work launch stays
blocked until identity + billing verified; native removal confirmation +
Recycle Bin/Trash preserved; no automatic failover or quota-evasion routing.
Pin/recent state is non-sensitive UI-only data in localStorage — no tokens,
auth files, transcripts, or real identities in the repo.

## Installer

- `pnpm windows:package` → NSIS installer built.
- **Unsigned.** No Windows code-signing certificate is configured in
  `package.json` (`build.win` has no `certificateFile`/`sign`), so the artifact
  is Authenticode `NotSigned`. Signing must be added on the release runner
  (certificate + `CSC_LINK`/`CSC_KEY_PASSWORD`) before public distribution;
  until then Windows SmartScreen will warn on launch.
- Artifact: `release/QuotaDeck-0.1.0-win-x64.exe` (~102 MB).
- The NSIS output is **not reproducible** — each `electron-builder` run embeds
  build-time metadata, so the SHA-256 differs per build. Do not pin a checksum
  here; generate `Get-FileHash <artifact> -Algorithm SHA256` on the
  release-runner build and publish that alongside the signed artifact.

## Dependency audit

`pnpm audit --audit-level=moderate` → **No known vulnerabilities found.**

## CI

`.github/workflows/ci.yml` runs a native matrix — `windows-latest`,
`macos-latest`, `ubuntu-latest` — for format/typecheck/test/build on every PR;
Linux additionally runs `pnpm audit`. Installer packaging is handled by
`release.yml`.

## Remaining gaps / follow-ups

- **Manual Windows acceptance is required before merge** — run
  `docs/manual-smoke.md` against isolated Electron user data (`--user-data-dir`).
  It covers the visual/behavioral checks jsdom cannot (width sweep, long-label
  paint, bounded scroll, reduced-motion, forced-colors, real CLI lifecycle).
- **Optional OS tray quick-switch** (item 10) is deferred — native main-process
  work; the in-app switcher and Accounts view cover switching today.
- **Dark theme** (item 9) is documented as deferred.
- Checksum above is from a dev machine; treat the CI/release-runner build as
  authoritative for distribution.
