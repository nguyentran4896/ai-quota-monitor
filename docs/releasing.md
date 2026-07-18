# Releasing QuotaDeck

## Release safety model

Manual workflow runs and tag runs while releases are disabled build unsigned
workflow artifacts. Those jobs do not reference or receive signing secrets.
Unsigned macOS inspection artifacts explicitly disable signing, hardened runtime,
and notarization together; they must not be distributed as public releases.

A signed public release runs only when all of these conditions hold:

1. the ref is an annotated or cryptographically signed semantic-version tag;
2. the tag version exactly matches `package.json`;
3. the repository variable `RELEASES_ENABLED` equals `true`;
4. the protected GitHub environment named `release` approves the native build;
5. required Windows and macOS credentials pass preflight checks.

The protected Windows and macOS commands set electron-builder's
[`forceCodeSigning`](https://www.electron.build/docs/features/code-signing/)
option, so a missing or invalid identity fails the build instead of silently
producing an unsigned artifact.

The publishing job downloads only the protected release artifacts and generates
`SHA256SUMS.txt` before creating the GitHub Release.

## Repository configuration

Enable GitHub private vulnerability reporting, Discussions, branch protection for
`main`, required CI and CodeQL checks, and tag protection for `v*` releases.

Create a GitHub environment named `release`. Restrict it to protected version
tags, require a reviewer when the repository has more than one maintainer, disable
self-approval when practical, and store these as **environment secrets**:

| Secret                 | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `WIN_CSC_LINK`         | Base64 or secure URL for an Authenticode `.pfx` certificate |
| `WIN_CSC_KEY_PASSWORD` | Password for the Windows certificate                        |
| `MAC_CSC_LINK`         | Base64 Developer ID Application `.p12` certificate          |
| `MAC_CSC_KEY_PASSWORD` | Password for the macOS certificate                          |
| `APPLE_API_KEY`        | Base64 App Store Connect `.p8` private key                  |
| `APPLE_API_KEY_ID`     | App Store Connect key ID                                    |
| `APPLE_API_ISSUER`     | App Store Connect issuer ID                                 |
| `APPLE_TEAM_ID`        | Apple Developer team ID                                     |

The workflow decodes `APPLE_API_KEY` into a permission-restricted runner-temporary
file because notarization expects a filesystem path. An `always()` cleanup step
removes that file. Certificates and private keys must never be committed, uploaded
as workflow artifacts, or stored as ordinary repository variables.

## Version and tag procedure

1. Update `version` in `package.json` and the lockfile.
2. Move the changelog's Unreleased entries into the new version.
3. Run `pnpm check`, `pnpm audit`, and inspect native unsigned workflow artifacts.
   On macOS, inspection artifacts intentionally lack Gatekeeper release trust.
4. Merge through a reviewed pull request.
5. Create an annotated tag: `git tag -a vX.Y.Z -m "QuotaDeck vX.Y.Z"`.
6. Push the tag. The workflow checks the tag object and package version before any
   protected release job can start.
7. Approve the `release` environment after confirming the tag and commit.
8. Install each published artifact on a clean OS account and verify its signature,
   checksum, profile login, quota refresh, terminal launch, close/reopen, profile
   removal, and uninstall behavior.

Local and manual workflow packaging is intentionally unsigned for development.
Those artifacts must never be described as public releases.

## What the protected workflow proves

- Windows: every emitted `.exe` reports a valid Authenticode signature.
- macOS: the `.app` passes strict `codesign`, Gatekeeper assessment, and stapled
  notarization-ticket validation; every DMG passes `hdiutil verify`.
- Linux: the Debian control archive is readable and the AppImage is executable.
- Publishing: only artifacts from all protected native jobs are downloaded, and
  the release receives SHA-256 checksums.

CI proof is necessary but not sufficient. Before announcing a preview, install
the published download on clean Windows, macOS Intel/Apple-silicon, and Linux
accounts and record the manual smoke-test results listed above.
