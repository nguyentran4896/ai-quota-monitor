# QuotaDeck

QuotaDeck is a local-first desktop companion for monitoring AI subscription runway across Claude Code and OpenAI Codex accounts. The first vertical slice reads only local, provider-produced signals:

- `claude auth status --json` for safe Claude connection and plan metadata;
- the newest `rate_limits` event in local Codex session logs for last-observed quota windows;
- no raw access tokens are exposed to the renderer, logs, or network.

The UI is usable as a live single-machine dashboard and can create named, isolated profiles. **Set up** opens the provider's official login in a new Windows Terminal tab; **Launch** starts a fresh CLI process with only that profile's `CLAUDE_CONFIG_DIR` or `CODEX_HOME`. QuotaDeck never changes the identity of a running session.

Current quota coverage is intentionally asymmetric:

- Claude connection and plan are live. Claude quota ingestion through its official status-line event is the next adapter milestone.
- Codex quota is read from the newest provider-emitted local session event. The documented Codex app-server RPC is the production target; the session reader is a clearly labeled fallback for this machine's packaged, non-invokable Codex binary.

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

See [the architecture decision](docs/architecture.md) and [provider research](docs/research/provider-quota-and-auth.md).
