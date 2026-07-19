# QuotaDeck improvement pass — verification & handoff

Merged to `main` via PR #16. A follow-up pass (PR #16 review fixes + this
update) added a real-browser visual regression suite and corrected the installer
signing description below. Manual Windows acceptance (`docs/manual-smoke.md`)
remains the recommended final check for anything the automated suites cannot
cover (real CLI lifecycle, forced-colors/reduced-motion paint).

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

- `pnpm check` → **green** (format:check + typecheck + **153 vitest tests** + build).
- `pnpm test:e2e` → **green** (5 Playwright specs in `e2e/`, real Chromium).
- New/expanded vitest specs: `account-preferences.test.ts`,
  `accounts-destination.test.tsx` (14-account scaling, search, provider/status
  filters, pin persistence & ordering, launch-records-recent, Ctrl+K on
  Accounts), `cli-settings.test.ts` (install guidance + Store-app caveat),
  `responsive-layout.test.ts` (bounded scroll for both the Accounts list and the
  Smart Switcher, reduced-motion, forced-colors), plus lifecycle/rename/toast/
  optimistic-save/48-char-label/setup-loop-escape-hatch/duplicate-name-sanitize
  cases in `App.test.tsx`.
- **Visual regression (`e2e/layout.spec.ts`)** renders the real production
  bundle in Chromium — the layout facts jsdom cannot verify: the Smart Switcher
  list stays height-bounded and internally scrollable with 14 accounts at
  1040/1280/1440px (launch action reachable), and the Accounts search paints a
  visible `:focus-within` ring (plus Ctrl+K focus).

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

## Installer & code signing

- **Local `pnpm windows:package` is unsigned by design.** No certificate is
  present locally, so `electron-builder` emits an Authenticode `NotSigned` NSIS
  installer (~102 MB). The `unsigned-build` job in `release.yml` builds the same
  way (`CSC_IDENTITY_AUTO_DISCOVERY=false`) for inspection artifacts, and
  SmartScreen will warn on such builds.
- **Signed release builds are already wired — conditional on the cert secret.**
  On a `v*` tag with repo variable `RELEASES_ENABLED=true`, `release.yml`'s
  `release-build` job signs the Windows artifact from the `WIN_CSC_LINK` /
  `WIN_CSC_KEY_PASSWORD` secrets, forces `-c.forceCodeSigning=true`, and fails
  the job unless `Get-AuthenticodeSignature` reports `Valid`
  (`scripts/verify-signing-env.mjs` pre-checks the secrets; macOS is signed +
  notarized in the same job). electron-builder auto-discovers the env-based cert,
  so **no `package.json` change is needed** — supply the certificate secret and
  the next tagged release is signed.
- **No checksum is pinned here.** The NSIS output is not reproducible (each build
  embeds build-time metadata), so its SHA-256 differs per build. The `publish`
  job writes `SHA256SUMS.txt` over the signed artifacts on the release runner —
  treat that as authoritative.

## Dependency audit

`pnpm audit --audit-level=moderate` → **No known vulnerabilities found.**

## CI

`.github/workflows/ci.yml` runs a native matrix — `windows-latest`,
`macos-latest`, `ubuntu-latest` — for format/typecheck/test/build on every PR;
Linux additionally runs `pnpm audit`. A separate `visual` job runs the Chromium
Playwright layout suite (`pnpm test:e2e`) on `ubuntu-latest`. Installer packaging
and signing are handled by `release.yml`.

## Remaining gaps / follow-ups

- **Manual Windows acceptance** (`docs/manual-smoke.md`, isolated
  `--user-data-dir`) is still recommended for the few things neither vitest nor
  the Chromium visual suite covers: forced-colors/reduced-motion paint and the
  real provider CLI lifecycle end to end.
- **Windows code signing needs its certificate secret.** The pipeline is wired
  (see Installer above); until `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` and
  `RELEASES_ENABLED=true` are set, tagged releases build unsigned.
- **Optional OS tray quick-switch** (item 10) is deferred — native main-process
  work; the in-app switcher and Accounts view cover switching today.
- **Dark theme** (item 9) is documented as deferred.
