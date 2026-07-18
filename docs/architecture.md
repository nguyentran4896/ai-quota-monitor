# QuotaDeck architecture and platform decision

Status: accepted for v0.1, 2026-07-18

## Decision

Build a local-first desktop companion with Electron, React, TypeScript, and Vite. Keep provider integrations behind adapters so the desktop shell and data sources can evolve independently.

The product must distinguish three states that other quota tools often blur:

1. **Provider-reported** — a structured quota value emitted by the provider client.
2. **Locally observed** — connection, plan, and last-seen state from an official local CLI.
3. **Unavailable** — the provider has not exposed a supported machine-readable signal.

Unknown values must stay unknown. QuotaDeck does not invent precision from token counts because subscription limits are model-, feature-, and policy-dependent.

## Platform comparison

| Platform | Advantages | Costs / risks | Verdict |
| --- | --- | --- | --- |
| Electron + React | Fastest path on the current Node/pnpm machine; mature tray, auto-update, filesystem and subprocess support; one TypeScript codebase | Larger installer and memory footprint; requires strict renderer isolation and dependency hygiene | **Selected for v0.1** |
| Tauri 2 + React | Small binaries, lower idle memory, narrow Rust command boundary | Rust is not installed on this machine; slower first iteration; native/plugin debugging adds complexity | Strong later optimization if footprint becomes a real problem |
| Browser/PWA + local daemon | Easy UI deployment and remote viewing | Two processes to secure and distribute; browsers cannot safely switch local CLI profiles; localhost auth/CSRF surface | Not recommended for the core product |
| VS Code extension | Lives where many Claude Code users work; easy command palette | Does not cover Codex desktop or non-VS Code workflows; extension host lifecycle is not a reliable monitor | Optional companion, not the platform |
| Hosted SaaS | Central view across devices | Subscription credentials and usage metadata would leave the machine; provider APIs do not expose all required personal-plan quota | Rejected for the account-switching core |

## Component boundaries

```text
Sandboxed React renderer
        |
        | typed, read-only IPC
        v
Electron main process
  |-- Claude adapter: official auth status + status-line quota event
  |-- Codex adapter: official app-server RPC + labeled local-event fallback
  |-- Profile registry: labels and isolated config roots, never raw tokens
  `-- History store (next): normalized quota snapshots only
```

The renderer never receives filesystem paths, command output, or credential material. Provider adapters return a normalized `AccountSnapshot` with provenance and timestamp.

## Multi-account switching design

The safe target is **profile isolation**, not token swapping:

- one provider config root per named profile where the official CLI supports a configurable home;
- the user completes provider login in the provider's own flow;
- QuotaDeck launches a work session with that profile's environment;
- the default global profile is never overwritten;
- the app stores labels, colors, and last normalized quota snapshot only.

Until official support for a provider/profile combination is verified, its switch action stays unavailable and the UI explains why. Directly renaming or copying `auth.json`, keychain entries, cookies, or refresh tokens is outside the design.

## Delivery stages

1. **Live local dashboard** — current implementation: Claude connection/plan plus last-observed Codex quota.
2. **Named isolated profiles** — create and explicitly connect/launch profiles without copying tokens. Implemented; archive/logout UX remains.
3. **First-party quota adapters** — implemented: Claude status-line ingestion and Codex app-server JSON-RPC, retaining the Codex local-event reader as fallback.
4. **History and alerts** — SQLite snapshots, reset countdown, stale-data indicators, Windows notifications.
5. **Tray and distribution** — close-to-tray and single-instance behavior are implemented; code signing, auto-update, and a persistent supervised Codex app-server remain.
6. **Cross-device optional sync** — only opt-in encrypted normalized metrics; never auth credentials.
