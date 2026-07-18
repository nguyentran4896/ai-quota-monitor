# Contributing to QuotaDeck

Thank you for helping make AI subscription management safer and easier. Small,
focused pull requests are preferred over broad rewrites.

## Development setup

Install Node.js 22 or newer and pnpm 11, then run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Before opening a pull request:

```sh
pnpm check
pnpm audit
```

Native installers must be built on their target operating system. Use
`pnpm package:win`, `pnpm package:mac`, or `pnpm package:linux`.

## Design rules

- Never read, copy, log, render, or upload provider credentials.
- Keep provider-specific behavior behind a main-process adapter.
- Expose only normalized, allow-listed data through the preload bridge.
- Preserve unknown quota values as unknown; never estimate subscription limits.
- Make account switching an explicit user action; do not automate quota evasion.
- Use argument arrays for subprocesses. Any required shell string must quote only
  app-controlled values and have behavioral tests for each target platform.
- Keep platform behavior covered by pure-function tests and native CI runners.
- Preserve keyboard operation, visible focus, modal focus trapping/return, and
  semantic status/error announcements. Test new dialogs and composite controls
  with accessible roles and keyboard input.

## Pull requests

Explain the user-visible outcome, security impact, platforms tested, and any
remaining limitations. Add or update tests at public seams. Do not include real
session logs, profile directories, email addresses, access tokens, or screenshots
containing account data.

When touching launch or status-line command generation, run
`tests/shell-boundary.test.ts` on the target operating system. When touching the
account cards or switcher, document any screen-reader or keyboard behavior that
still needs native manual verification.

Contributions are licensed under Apache-2.0 under the inbound-equals-outbound
model described by the project license.
