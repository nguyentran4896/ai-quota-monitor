# QuotaDeck roadmap

The roadmap prioritizes trustworthy provider data and safe account isolation over
feature count. Dates are intentionally omitted until native release feedback is
available.

## Cross-platform public preview

- Run CI and native packaging on Windows, macOS, and Linux.
- Complete Windows signing and macOS signing/notarization.
- Verify install, login, quota refresh, terminal launch, close/reopen, profile
  removal, and uninstall on clean native accounts.
- Publish checksums and a signed `v0.2.0` preview release.

## History

- Store normalized, non-secret quota snapshots with bounded retention.
- Implement a History screen with export/delete controls. Configurable local
  quota notifications and the first Settings controls are already in the current
  baseline.

## Account management

- Rename and color-label managed profiles.
- Add archive and orphaned-profile recovery workflows.

## 1.0 readiness

- Maintain native smoke-test evidence for every release artifact.
- Document provider-policy review and adapter compatibility ranges.
- Complete native VoiceOver, Narrator, NVDA, keyboard-only, contrast, and 200%
  zoom review; then add localization infrastructure.
- Establish two-maintainer review for release and security-sensitive changes.
- Evaluate auto-update only after signed releases and rollback behavior are proven.

Automatic account rotation, token copying, browser-cookie extraction, and hosted
credential synchronization remain permanent non-goals.
