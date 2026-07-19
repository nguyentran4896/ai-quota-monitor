# Manual & visual smoke checklist

Automated tests cover logic and the static CSS contract, but jsdom does not
apply media queries, layout, scrolling, or paint. This checklist covers what
only a real Electron render can verify. Run it on native Windows.

## Isolated, safe setup

Never use or alter real managed-profile data. Launch the app against an
**isolated** Electron user-data directory (Electron's built-in
`--user-data-dir` switch) so nothing touches your real Claude/Codex logins or
QuotaDeck profile registry:

```powershell
$smoke = "$env:TEMP\quotadeck-smoke"
Remove-Item -Recurse -Force $smoke -ErrorAction SilentlyContinue

# Packaged app:
& "$env:LOCALAPPDATA\Programs\QuotaDeck\QuotaDeck.exe" --user-data-dir="$smoke"

# From source (Electron passes the switch straight through):
pnpm build; npx electron dist-electron/main.cjs --user-data-dir="$smoke"
```

Use throwaway accounts only. Do not commit tokens, auth files, transcripts, or
real identities.

## Visual / layout (CSS the DOM tests can't see)

- [ ] **Width sweep 1040 → 1440px.** Drag the window from its minimum width up.
      The Smart switcher and the primary Launch/Set-up control stay visible and
      usable the whole way — nothing critical is hidden by `display:none`
      (item 2).
- [ ] **Ctrl+K** focuses the account selector at every width (item 2).
- [ ] **Long labels.** Create a managed profile with a 48-character label. Its
      card keeps the status dot, pin, rename, and remove controls intact; the
      label ellipsizes instead of overlapping (item 4).
- [ ] **Accounts destination with 12+ profiles.** The list scrolls internally
      and the toolbar (search / filters / sort) stays pinned above it (item 10).
- [ ] **Pinned ordering.** Pin a profile; it floats to the top and stays pinned
      across a relaunch (items 6, 10).
- [ ] **Toast region.** Trigger a launch/rename/remove; the toast appears
      outside the switcher, names the account, and is dismissible (item 5).

## Accessibility (rendered)

- [ ] **Reduced motion.** Enable Windows "Show animations" off. Spinners and
      transitions are calmed (item 9).
- [ ] **High contrast / forced colors.** Turn on a Windows high-contrast theme.
      Status dots, pills, and cards remain legible with system colors (item 9).
- [ ] **Keyboard only.** Tab through the shell; the account listbox uses roving
      tabindex, dialogs trap focus and restore it on close (item 9).
- [ ] **Screen reader.** With Narrator, each status dot and quota bar announces
      a meaningful name (account, window, % available/used) (item 9).

## Lifecycle & safety (behavioral, on real CLIs)

- [ ] **New managed profile** shows "Set up this account", not "Launch", and
      completes sign-in through the official flow (item 1).
- [ ] **Signed-out / CLI-missing / timeout** each surface a distinct status and
      a direct fix (e.g. Open CLI settings), never a bare "unknown" (item 1).
- [ ] **Work launch stays blocked** until identity and billing are verified
      (item 1) — confirm an unverified profile cannot launch a work session.
- [ ] **CLI settings.** With a provider CLI uninstalled, the card shows the
      official Windows install command and the "Store app is not the CLI"
      caveat; Recheck and Install guide work; the executable picker filters
      exe/cmd/bat/ps1 (item 7).
- [ ] **Alert threshold** saves optimistically (Saving… → Saved) without
      triggering a full quota refresh (item 8).
- [ ] **Safe removal** confirms with the provider + short id, and moves the
      isolated profile home to the Recycle Bin (never a hard delete) (item 3).

## Security invariants (must hold)

- [ ] No raw tokens, filesystem paths, or raw command output appear in the
      renderer (DevTools → inspect network/IPC payloads and visible text).
- [ ] No automatic account failover or quota-evasion routing occurs.
