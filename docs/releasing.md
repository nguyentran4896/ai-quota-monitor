# Releasing QuotaDeck

## Release safety model

The release workflow always builds downloadable workflow artifacts on Windows,
macOS, and Linux. It publishes a GitHub Release only when both conditions hold:

1. the ref is a signed or annotated `v*` tag; and
2. the repository variable `RELEASES_ENABLED` equals `true`.

Leave that variable unset while the project is being initialized. This prevents
an accidental tag from publishing unsigned desktop binaries.

## Repository configuration

Enable GitHub private vulnerability reporting, Discussions, branch protection for
`main`, required CI and CodeQL checks, and tag protection for `v*` releases.

Configure these Actions secrets before enabling releases:

| Secret                 | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `WIN_CSC_LINK`         | Base64 or secure URL for an Authenticode `.pfx` certificate |
| `WIN_CSC_KEY_PASSWORD` | Password for the Windows certificate                        |
| `MAC_CSC_LINK`         | Base64 Developer ID Application `.p12` certificate          |
| `MAC_CSC_KEY_PASSWORD` | Password for the macOS certificate                          |
| `APPLE_API_KEY`        | Base64 App Store Connect API private key                    |
| `APPLE_API_KEY_ID`     | App Store Connect key ID                                    |
| `APPLE_API_ISSUER`     | App Store Connect issuer ID                                 |
| `APPLE_TEAM_ID`        | Apple Developer team ID                                     |

The workflow maps those secrets to electron-builder's documented environment
variables. Certificate values must never be committed or placed in artifacts.

## Version and tag procedure

1. Update `version` in `package.json` and the lockfile.
2. Move the changelog's Unreleased entries into the new version.
3. Run `pnpm check` and inspect native workflow artifacts.
4. Merge through a reviewed pull request.
5. Create an annotated tag: `git tag -a vX.Y.Z -m "QuotaDeck vX.Y.Z"`.
6. Push the tag. The native workflow verifies required credential names, signs,
   notarizes, packages, and publishes the release.
7. Install each published artifact on a clean OS account and verify profile login,
   one quota refresh, terminal launch, close/reopen, and uninstall behavior.

Local packaging is intentionally allowed without signing for development. Such
artifacts must not be described as public releases.
