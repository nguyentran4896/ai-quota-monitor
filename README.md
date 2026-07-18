# QuotaDeck

QuotaDeck is a local-first desktop companion for monitoring AI subscription runway across Claude Code and OpenAI Codex accounts. The first vertical slice reads only local, provider-produced signals:

- `claude auth status --json` for safe Claude connection and plan metadata;
- the newest `rate_limits` event in local Codex session logs for last-observed quota windows;
- no raw access tokens are exposed to the renderer, logs, or network.

The UI is usable as a live single-machine dashboard and can create named, isolated profiles. **Set up** opens the provider's official login in a new Windows Terminal tab; **Launch** starts a fresh CLI process with only that profile's `CLAUDE_CONFIG_DIR` or `CODEX_HOME`. QuotaDeck never changes the identity of a running session.

Closing the window keeps QuotaDeck in the Windows tray so its minute-level local refresh continues. A second launch focuses the existing single instance; use the tray menu's **Quit** action to stop it completely.

Current quota coverage uses the strongest documented local source available:

- Claude managed profiles receive an app-owned launch-time status line. After the first real Claude response it stores only the official five-hour/seven-day percentages, reset times, observation time, and CLI version. Existing user status lines are preserved and never overwritten.
- Codex first uses the documented `account/read` and `account/rateLimits/read` app-server RPCs. When a standalone app-server is unavailable—as with this machine's packaged, non-invokable Codex binary—it falls back to the newest provider-emitted local session event and labels that provenance clearly.

## Run locally

Requirements: Node.js 22+ and pnpm 10+.

```powershell
pnpm install
pnpm dev
```

For a production build:

```powershell
pnpm build
pnpm package:win
```

## Quality checks

```powershell
pnpm typecheck
pnpm test
pnpm build
```

## Security boundary

The Electron renderer is sandboxed, has no Node.js integration, and receives a narrow allow-listed IPC contract. QuotaDeck does not copy, serialize, upload, or display provider tokens. Exact quota is shown only when a provider-produced local event contains it; missing data is labeled unavailable rather than estimated. Switching is always an explicit user action that launches or focuses a profile—there is no automatic prompt failover.

Managed subscription launches remove inherited `ANTHROPIC_*`, Claude cloud-provider, and `OPENAI_API_KEY` overrides from the child environment so an account card cannot silently become a pay-as-you-go session. The user's global environment is never modified.

See [the architecture decision](docs/architecture.md) and [provider research](docs/research/provider-quota-and-auth.md).
