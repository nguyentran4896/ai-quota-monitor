# Provider quota and authentication research

## Anthropic Claude Code

_Research snapshot: 2026-07-18. Primary sources are Anthropic's current documentation, Help Center, terms, and the locally installed official CLI. Plan limits and CLI fields are product behavior, not durable contracts; re-check them before shipping._

### Bottom line

An account-aware Claude Code monitor is technically feasible without reading or copying OAuth tokens, but it is not a conventional polling integration:

- Anthropic does **not document a public quota API for individual Pro or Max accounts**. The organization analytics APIs are not available to individual accounts and report historical usage/productivity rather than the live subscription allowance ([Claude Code Analytics API](https://platform.claude.com/docs/en/manage-claude/claude-code-analytics-api)).
- The official CLI now exposes live Pro/Max quota data to an opt-in **status-line command**. After the first API response in a session, its local JSON input can include five-hour and seven-day percentages plus reset epochs. This is the safest machine-readable source for a local monitor ([status-line fields and availability](https://code.claude.com/docs/en/statusline#available-data)).
- Anthropic explicitly documents `CLAUDE_CONFIG_DIR` as useful for running multiple accounts side by side. Each account should therefore get its own official Claude configuration directory and complete its own browser OAuth login; the monitor should never copy, parse, or mint credentials ([environment variable reference](https://code.claude.com/docs/en/env-vars#environment-variables)).
- “Switch account” should mean **manually launch the official CLI with the selected profile directory**. Do not build an automatic prompt router that rolls work onto the next subscription when a limit is reached. Anthropic restricts automated/non-human subscription access, credential sharing, scraping, and bypassing protective measures; its current login guidance also prohibits third-party tools that route third-party traffic against subscription limits ([Consumer Terms](https://www.anthropic.com/legal/consumer-terms), [Claude login guidance](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account)).

This yields a useful but deliberately bounded product: a local dashboard that shows the latest officially observed allowance, reset times, login state, and a clear **Launch with this account** action. It is not a subscription-traffic proxy.

### Current subscription quota model

There is no stable “N prompts remaining” number. Anthropic says usage varies with message length, attachments, conversation length, model, feature, and effort. The UI and CLI expose percentages, not a durable prompt count, so the product must store and display percentages and reset timestamps rather than inventing prompt estimates ([usage and length limits](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work)).

| Account/plan | Current documented allowance behavior | What the monitor can safely claim |
| --- | --- | --- |
| Pro | Session allowance resets every five hours. A weekly limit applies across all models and resets at a fixed weekday/time assigned to that account ([Pro plan](https://support.claude.com/en/articles/8325606-what-is-the-pro-plan)). | “Five-hour usage” and “weekly usage” when the official CLI reports them; never a fixed prompt count. |
| Max 5x / Max 20x | The two tiers provide 5x or 20x Pro usage per session. Max currently has two weekly limits: one across all models and another for Sonnet; both reset at the account's assigned fixed weekly time ([Max plan](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)). | The CLI status-line contract currently exposes one `seven_day` object, so a dashboard must not imply it has captured both web UI weekly bars. Label the CLI value generically and show an “additional weekly limit may apply” note until Anthropic exposes separate fields. |
| Team / seat-based Enterprise | Limits and controls depend on seat and organization configuration. Organization administrators have analytics and, on qualifying plans, APIs and usage-credit controls ([Team/Enterprise analytics](https://support.claude.com/en/articles/12883420-view-usage-analytics-for-team-and-enterprise-plans)). | Treat organization analytics as a separate adapter. Do not mix organization cost/activity metrics with a user's live subscription allowance. |
| Console/API key or cloud provider | Pay-as-you-go is billed per token and governed by API spend/rate limits, not Pro/Max subscription windows. `/cost` is useful for the current API-backed session ([models, usage, and limits](https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code), [API rate limits](https://platform.claude.com/docs/en/api/rate-limits)). | Show spend/rate-limit data in a distinct “API billing” mode. Never present it as subscription quota. |

Usage is shared across Claude product surfaces: activity in Claude on the web, desktop/mobile apps, and Claude Code draws from the same plan allowance ([usage and length limits](https://support.claude.com/en/articles/11647753-how-do-usage-and-length-limits-work)). A Claude Code-only event collector can therefore become stale or jump unexpectedly after the user works in another Claude surface. The UI should say “last observed” and show the observation time.

Paid individual users can enable usage credits after included limits are reached. Those credits are separately billed at API rates, while the included session limit continues to reset on its normal five-hour cycle ([usage credits](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans)). Keep included-plan percentage and paid-credit spend separate in the data model and UI.

### What is visible today

#### First-party interactive views

- **Claude Settings → Usage** is the authoritative user-facing view. For Pro, Max, Team, and seat-based Enterprise it shows progress bars for the current five-hour session and weekly limits, plus time to/reset time. It also shows usage-credit information when enabled ([usage limit best practices](https://support.claude.com/en/articles/9797557-usage-limit-best-practices#h_53e83f81ac)).
- **`/usage`** in an interactive Claude Code session shows the plan's usage limits and current rate-limit status ([Claude Code cheatsheet](https://support.claude.com/en/articles/14553413-claude-code-cheatsheet)). It is a TUI command, not a documented headless JSON command.
- **`/status`** identifies the active login/provider. This is important because environment variables and cloud-provider flags can override a subscription login ([authentication precedence](https://code.claude.com/docs/en/authentication#authentication-precedence)).

The monitor should offer buttons that launch the official `/usage` flow or open Settings → Usage for manual confirmation, but it should not scrape either UI.

#### First-party machine-readable surfaces

1. **Status-line JSON — best live subscription signal.** An official status-line command receives JSON on stdin. For Pro/Max subscribers, after the first model response it may contain:

   ```json
   {
     "rate_limits": {
       "five_hour": {
         "used_percentage": 23.5,
         "resets_at": 1738425600
       },
       "seven_day": {
         "used_percentage": 41.2,
         "resets_at": 1738857600
       }
     }
   }
   ```

   Percentages are 0–100 and reset values are Unix epoch seconds. `rate_limits`, or either child window, can be absent; the whole object is limited to Claude.ai Pro/Max logins and appears only after the first API response. The script runs locally and consumes no model tokens ([status-line rate-limit contract](https://code.claude.com/docs/en/statusline#rate-limit-usage)).

2. **`claude auth status --json` — best local identity/auth signal.** The current official CLI documents a JSON authentication-status command with exit code 0 when logged in and 1 otherwise ([CLI reference](https://code.claude.com/docs/en/cli-reference#cli-commands)). It does not return allowance percentages.

3. **OpenTelemetry — useful for activity and costs, not remaining allowance.** Claude Code can export token usage, estimated cost, session counts, tool activity, and identity attributes to a local/organization OTel collector. The published metrics do not expose the Pro/Max remaining-percentage windows, so OTel complements rather than replaces the status-line adapter ([Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage)).

4. **Organization analytics APIs — useful for reporting, not live individual quota.** The Claude Code Analytics Admin API is unavailable to individual accounts, uses an admin key, returns daily user-level usage/productivity data, and may lag by up to an hour. Enterprise uses a different Analytics API/key. Neither is documented as the source for current Pro/Max five-hour or weekly headroom ([Claude Code Analytics API](https://platform.claude.com/docs/en/manage-claude/claude-code-analytics-api), [Analytics APIs](https://platform.claude.com/docs/en/manage-claude/analytics-api)).

There is currently no documented `claude usage --json` terminal command and no documented individual-subscription REST endpoint. Do not depend on private `claude.ai` network calls, browser cookies, reverse-engineered OAuth endpoints, TUI screen scraping, or an undocumented credentials-file schema.

### Authentication, files, and account switching

Anthropic's supported CLI paths are:

- `claude auth login --claudeai` for subscription OAuth (browser interaction required), with optional `--email` to pre-fill the address.
- `claude auth login --console` for Console/API billing.
- `claude auth logout` to remove the active official login.
- `claude auth status --json` to check the active login from a script.
- Interactive `/login` and `/logout` remain supported. Logging out resets first-launch setup, so a single-directory logout/login switch is intentionally disruptive ([CLI reference](https://code.claude.com/docs/en/cli-reference#cli-commands), [authentication](https://code.claude.com/docs/en/authentication#log-in-to-claude-code)).

There is no official multi-slot “activate account X” command inside one Claude config directory. The safe way to get fast switching is process-level isolation:

```powershell
$env:CLAUDE_CONFIG_DIR = 'C:\Users\me\.ai-quota-monitor\claude\work'
claude auth login --claudeai     # once, completed by the user in the browser
claude auth status --json        # validation, not quota
claude                           # every launch for that profile uses the same env
```

Use a new process-scoped environment block for every launch rather than mutating the user's global environment. `CLAUDE_CONFIG_DIR` relocates settings, session history, plugins, and—on Windows/Linux—credentials; Anthropic explicitly describes it as useful for multiple accounts side by side ([environment variable reference](https://code.claude.com/docs/en/env-vars#environment-variables)). This also means histories, plugins, memories, and user settings are isolated unless the product deliberately offers a separate, non-secret configuration-sync feature.

Credential storage is platform-specific: macOS uses Keychain; Linux uses `~/.claude/.credentials.json` mode `0600`; Windows uses `%USERPROFILE%\.claude\.credentials.json` under the user's profile ACL. With `CLAUDE_CONFIG_DIR` on Windows/Linux, that credential file moves under the selected directory. Claude Code itself manages it through login/logout ([credential management](https://code.claude.com/docs/en/authentication#credential-management)). The product should treat the file as an opaque implementation detail.

Credential precedence can otherwise make the selected card lie. Cloud-provider flags win first, followed by `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `apiKeyHelper`, `CLAUDE_CODE_OAUTH_TOKEN`, and finally the saved subscription OAuth login. Always run `auth status` in the exact process environment that will launch Claude, and warn when the observed method/provider differs from the profile's expected subscription login ([authentication precedence](https://code.claude.com/docs/en/authentication#authentication-precedence)).

Anthropic's web account selector officially supports switching between a personal account and a Team/Enterprise organization tied to the same email. That does not amount to a general CLI profile manager for arbitrary individual subscriptions ([Claude account login](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account#h_92d90165db)).

### Local CLI evidence on this Windows machine

Read-only checks on 2026-07-18 found:

- Official binary: `C:\Users\PC\.local\bin\claude.exe`
- Version: `2.1.214 (Claude Code)`
- `claude auth login`, `claude auth logout`, and `claude auth status --json|--text` are present.
- The JSON status fields returned by this build are `loggedIn`, `authMethod`, `apiProvider`, `email`, `orgId`, `orgName`, and `subscriptionType`. The current login is a Claude.ai Max subscription. Email and organization values were deliberately not recorded.
- No `ANTHROPIC_*` or `CLAUDE_*` environment override was set, `CLAUDE_CONFIG_DIR` was unset, and the default `%USERPROFILE%\.claude\.credentials.json` existed. Its contents were **not read**.

This verifies current behavior of the installed build; it is not a promise that the JSON schema or paths will remain unchanged. The adapter should parse defensively, retain the CLI version with each observation, and tolerate unknown or absent fields.

### Recommended safe local architecture

#### Provider adapter boundary

Keep the Claude adapter local and deliberately narrow:

```text
Dashboard
  -> profile registry (labels + config-directory paths; no credentials)
  -> Claude process launcher (process-scoped CLAUDE_CONFIG_DIR)
  -> official claude.exe
       -> auth status JSON (identity/method only)
       -> status-line adapter JSON (quota only, event driven)
  -> user-scoped local snapshot store
```

Recommended account record:

```text
ClaudeProfile
  id, display_name, config_dir, expected_auth_method, masked_identity,
  subscription_type, last_auth_check_at

QuotaSnapshot
  profile_id, source="claude-statusline", cli_version,
  five_hour_used_pct, five_hour_resets_at,
  seven_day_used_pct, seven_day_resets_at,
  observed_at
```

Do not store a guessed capacity denominator or “prompts left.” Derive `remaining_pct = 100 - used_pct`, retain fractional values, and mark a card stale when its `observed_at` is old. After a reset epoch passes without a new event, show “awaiting refresh,” not 0% used.

#### Enrollment and launch flow

1. User chooses **Add Claude account** and a local label.
2. App creates a dedicated config directory under its user-only profile root.
3. App opens a visible terminal/browser OAuth flow with `CLAUDE_CONFIG_DIR=<that directory>` and `claude auth login --claudeai`. Login is always completed by the user.
4. App runs `claude auth status --json` in the same environment, shows masked identity/plan, and asks for confirmation before saving the profile.
5. **Launch** opens a visibly labeled terminal with that profile's environment. Multiple profiles can be open concurrently because their config directories are separate.
6. **Switch** launches or focuses the selected profile; it does not rewrite another running process's environment or silently forward a pending prompt.
7. **Remove profile** first offers `claude auth logout` in that profile. Deleting a credential-bearing directory must be a separate explicit, recoverability-aware operation.

#### Quota collection flow

Use an app-managed, opt-in status-line command. It should:

- Parse stdin and immediately discard everything except `rate_limits`, `version`, and optionally `model.id`. Status-line input also contains sensitive local context such as CWD, transcript path, session ID, git repository, and cost; none is needed for quota cards.
- Send the allow-listed quota observation to a Windows named pipe restricted to the current user's SID, or atomically replace a user-ACL-protected cache file. Do not bind an unauthenticated LAN listener.
- Return a short status line or no visual text, and finish quickly. Anthropic cancels slow/in-flight status-line executions and requires workspace trust for shell-executing status lines ([status-line lifecycle and security](https://code.claude.com/docs/en/statusline#how-status-lines-work)).
- Never make a Claude request. Observations arrive after the user's real Claude responses, so the monitor itself does not burn quota.

Only one `statusLine` setting is available. If a profile already has one, do not overwrite it silently. V1 should ask the user to choose between the existing line and monitor integration; a later version can offer a carefully reviewed multiplexer. Put integration in the profile's user settings or an explicit launch-time settings layer, never in a repository's committed `.claude/settings.json`.

OTel can be offered later for activity history and estimated cost, but it brings materially more identity/telemetry data. Keep it off by default for a personal quota monitor and do not require it for basic allowance cards.

### Security and policy guardrails

These should be product requirements, not documentation footnotes:

- **No token custody.** Do not read, copy, encrypt, sync, or display `.credentials.json`, `CLAUDE_CODE_OAUTH_TOKEN`, browser cookies, magic links, or API keys. Let the official CLI own credentials.
- **No credential sharing.** Consumer Terms prohibit sharing account login information/credentials or making an account available to anyone else ([Consumer Terms, account access](https://www.anthropic.com/legal/consumer-terms#2-account-creation-and-access)). The app must be single-user/local by default; no “share profile” or cloud token vault.
- **No scraping or private endpoints.** Consumer Terms prohibit crawling/scraping and automated/non-human access except through an API key or where explicitly permitted. The documented local status-line callback and auth-status command are explicit official surfaces; browser DOM/network interception is not ([Consumer Terms, use of services](https://www.anthropic.com/legal/consumer-terms#3-use-of-our-services)).
- **No subscription proxy.** Current Anthropic guidance says subscription usage is for ordinary use of native Anthropic apps, recommends API keys for third-party software, and prohibits misrepresentation or routing third-party traffic against subscription limits ([Claude login guidance](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account#h_d5fcb14d11)). A distributable service that sends prompts for users must use Console/cloud-provider API authentication, not consumer OAuth.
- **No automatic quota evasion.** Terms prohibit bypassing systems or protective measures. Owning several subscriptions does not create clear permission to automatically rotate them to evade a limit. Make switching user-initiated, keep the account identity visible, and position the product for legitimate personal/work separation and capacity awareness—not cap circumvention. Obtain legal/product-policy review before distributing this capability. This is risk guidance, not legal advice.
- **No hidden shell construction.** Launch `claude.exe` with an argument array and a process environment map, validate/canonicalize config paths under the app-owned root, and never interpolate profile labels into shell commands.
- **Minimize PII.** Mask email by default, encrypt the local database with an OS-user-bound mechanism if identity is retained, redact identity from logs/crash reports, and provide one-click deletion of non-credential snapshots.
- **Prevent profile confusion.** Compare observed auth method/provider/plan with the selected profile before launch. Display a large account badge in the dashboard and terminal title. An `ANTHROPIC_API_KEY` or cloud-provider flag can otherwise cause unexpected billing even after a successful subscription login.
- **Be explicit about staleness and incompleteness.** Cross-surface use can change quota without a local event; rate fields are absent before the first response; Max has more weekly limits than the status-line schema exposes. Never present stale or partial information as authoritative.

### Recommended V1 scope for Claude

Ship only:

1. Local profile registry backed by one `CLAUDE_CONFIG_DIR` per authorized account.
2. Interactive official login/logout and defensive `auth status --json` validation.
3. Manual **Launch** / **Switch** actions that start the official CLI with a selected process environment.
4. Event-driven status-line ingestion for five-hour and seven-day percentages/reset epochs.
5. Stale/partial badges and links to official `/usage` / Settings → Usage verification.
6. Local notifications at configurable thresholds, computed from already collected snapshots.

Defer or reject:

- Browser automation, cookie import, private Claude endpoints, credentials-file parsing, headless OAuth, or synthetic “refresh quota” prompts.
- Automatic routing of prompts/jobs to another consumer subscription.
- Cloud sync of Claude profiles or tokens.
- Treating OTel or organization analytics as the remaining-allowance source.
- Fixed prompt-count estimates or a combined universal “AI quota” unit.

The resulting integration is less magical than a polling proxy, but it follows the official surfaces, keeps secrets under Claude Code's control, and remains honest about what Anthropic exposes.

---

## OpenAI Codex / ChatGPT

### Bottom line

OpenAI exposes a stronger supported local integration surface than a browser scraper: the open-source Codex `app-server` has documented JSON-RPC methods for the signed-in account, rate-limit windows, and recent usage. For subscription accounts, those methods are the best quota source for this product. Authentication and sessions live beneath a Codex home directory, so the safest practical multi-account arrangement today is one independent `CODEX_HOME` per profile and one official Codex process/app-server per active profile. The profile registry should store only the home-directory path and presentation metadata—not tokens.

OpenAI does not currently document a first-class Codex CLI “auth profile” switcher. ChatGPT's web account switcher is limited to two simultaneously signed-in web accounts and explicitly does not apply to the Codex desktop app or native mobile apps. Therefore, a V1 **Switch** action should launch or focus a new Codex CLI process using the selected isolated home; it should not patch a running session, rewrite `auth.json`, or imply that web account switching changes Codex ([OpenAI account-switching help](https://help.openai.com/en/articles/20001068-use-multiple-accounts-with-account-switching), [Codex auth docs](https://learn.chatgpt.com/docs/auth)).

### What the subscription limits mean

Codex is included with eligible ChatGPT plans. Local messages and cloud chats share a five-hour window, and additional weekly limits may apply. Consumption varies materially with the model, task size, context, reasoning effort, tool calls, and caching; the pricing page deliberately describes approximate ranges rather than a fixed prompt allowance ([Codex pricing](https://learn.chatgpt.com/docs/pricing), [using Codex with a ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)).

As of 2026-07-18, the official pricing page gives these examples for **local messages per shared five-hour window** on ChatGPT Plus:

| Model | Approximate local messages / 5h on Plus |
|---|---:|
| GPT-5.6 Sol | 15–90 |
| GPT-5.6 Terra | 20–110 |
| GPT-5.6 Luna | 50–280 |
| GPT-5.5 | 15–80 |
| GPT-5.4 | 20–100 |
| GPT-5.4 mini | 60–350 |

The same page describes Pro capacity as higher plan tiers rather than a promise that every task costs one message. These ranges are useful onboarding context, not a counter the application should calculate. The authoritative UI should render the account-specific windows returned by Codex and should preserve their server-provided duration and reset timestamp. Do not hard-code “primary equals five hours” or “secondary equals weekly”; classify windows by `windowDurationMins` and label unknown durations honestly.

Once included usage is exhausted, eligible Plus and Pro users can purchase credits; API-key usage is separately metered and billed. The product must keep three balances visually distinct:

1. subscription-included rate-limit windows;
2. purchased Codex credits or enterprise flexible credits; and
3. OpenAI API platform billing.

They are not interchangeable quota pools ([Codex credits help](https://help.openai.com/en/articles/12642688), [Codex pricing](https://learn.chatgpt.com/docs/pricing)).

### Supported quota and account surfaces

The documented Codex app-server protocol is the preferred machine-readable source. A local client can start `codex app-server` and communicate over JSON-RPC. Relevant stable methods are documented in OpenAI's official repository ([app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)):

| RPC | Product use |
|---|---|
| `account/read` | Read the active account type and, when supplied, identity/plan information. Use it to verify that the selected profile is really the intended account. |
| `account/login/start` | Start the official ChatGPT browser login, device-code login, or API-key login flow. |
| `account/logout` | Let Codex clear the selected profile's own credentials. |
| `account/rateLimits/read` | Read current primary/secondary windows, `usedPercent`, `windowDurationMins`, `resetsAt`, limit-reached state, and any returned individual/spend-control or banked-reset-credit fields. |
| `account/rateLimits/updated` | Receive quota updates without aggressive polling. |
| `account/usage/read` | Read the available ChatGPT account token-activity summary and daily buckets. Treat this as activity evidence, not as a substitute for the remaining-limit windows. |

This is a **local Codex protocol**, not a public internet REST endpoint. Bind the monitor to the app-server child's stdin/stdout (or the exact documented local transport) and never expose it on the LAN. Because the repository's `main` documentation evolves, pin and test a supported Codex version and protocol schema, tolerate additional fields, and downgrade gracefully when a method is unavailable.

For a human verification route, the official pricing documentation says `/status` shows the remaining limits and links to the Codex usage dashboard ([Codex pricing](https://learn.chatgpt.com/docs/pricing)). The dashboard is a fallback for the user, not a target for cookie capture or DOM/private-API scraping.

OpenAI Platform API usage is a different product surface. Its usage dashboard and response token accounting describe API-organization spend; they do not provide a personal ChatGPT subscription's remaining Codex allowance. Enterprise analytics and compliance APIs are organization-admin surfaces and should be separate adapters if ever added—not silently treated as consumer-account quota.

### Supported authentication and profile isolation

The official CLI supports:

- `codex login` for browser-based ChatGPT authentication;
- `codex login --device-auth` for device-code login where browser callback is impractical;
- `codex login status` for status inspection; and
- `codex logout` to remove the active Codex home's authentication.

The CLI and IDE extension normally share their authentication cache. OpenAI documents that credentials are stored either in `~/.codex/auth.json` or in the operating system credential store, controlled by `cli_auth_credentials_store = file | keyring | auto`. It explicitly warns that `auth.json` must be treated like a password ([Codex auth docs](https://learn.chatgpt.com/docs/auth)).

For several accounts, create an app-owned directory per profile and set `CODEX_HOME` only in the environment of the child process:

```text
%LOCALAPPDATA%\AIQuotaMonitor\providers\openai\profiles\<opaque-id>\codex-home
```

Then run the official login inside that home. OpenAI maintainers have confirmed that Codex instances share auth by default and that a different `CODEX_HOME` is the current isolation workaround; all profile settings, authentication, and session details are independent there ([official Codex issue #12019](https://github.com/openai/codex/issues/12019)). A separate official issue remains open for first-class `--auth-profile` support, so the monitor must regard home isolation as a compatibility technique rather than invent a nonexistent native switch command ([official Codex issue #4432](https://github.com/openai/codex/issues/4432)).

Do **not** copy `auth.json` between homes. Codex maintainers specifically warn that refresh-token rotation and possible single-use semantics can make copied credentials race, invalidate one another, or fail unpredictably; authenticate each home separately through the official flow ([official Codex issue #15410](https://github.com/openai/codex/issues/15410)). This also means “switching” an account is a fresh-process boundary:

```text
select profile → verify profile home → start/focus that profile's Codex process
```

An already-running Codex session should retain its original identity. The app must show which account a terminal belongs to and must not silently transplant a session to another account.

### Safe OpenAI adapter

For each configured account:

1. Generate an opaque profile ID and a dedicated Codex home under the application data directory.
2. Start the official app-server with that `CODEX_HOME`; do not set or mutate a machine-global environment variable.
3. If unauthenticated, invoke the documented `account/login/start` flow and let Codex own the returned credentials.
4. Confirm identity and plan using `account/read`; mask email in the main UI and never use email as a filesystem name.
5. Subscribe to `account/rateLimits/updated`; call `account/rateLimits/read` at startup, focus, and a conservative interval with jitter.
6. Store normalized snapshots containing source, observed time, raw window duration, used percentage, reset epoch, and staleness/partial flags. Preserve the raw JSON only if it contains no credentials and redact identifiers before logs or crash reports.
7. Launch Codex CLI/IDE integration with the exact selected child environment. Use argument arrays, not shell-built strings.
8. On logout or profile deletion, call `account/logout`, stop the process, then remove only the app-owned profile directory after an explicit confirmation.

When a reset timestamp passes without a new server observation, display **Awaiting refresh**. Do not optimistically turn the meter to zero; cross-device or cloud usage may have changed the true state.

### Policy and security boundaries

OpenAI's current Terms of Use prohibit sharing account credentials or making an account available to someone else, automatically or programmatically extracting data or output, interfering with service operation, and circumventing rate limits or protective measures ([OpenAI Terms of Use](https://openai.com/policies/terms-of-use/)). OpenAI's account-sharing policy likewise says an account is intended for the person who created it, although that person may use it on multiple devices ([account-sharing policy](https://help.openai.com/en/articles/10471989-openai-account-sharing-policy)).

The documented app-server account methods are an official client integration surface, so use them instead of extracting dashboard data. The product should still be narrowly scoped:

- **Manual switch only.** Alerts may recommend an account, but the user must explicitly select and launch it. Automatic prompt failover or job routing when a limit is reached creates a serious risk of being viewed as rate-limit circumvention.
- **Single-user local profiles.** No shared/team credential vault for consumer accounts, remote token relay, or SaaS proxy.
- **No credential parsing.** Never read, display, copy, import, export, or synchronize `auth.json`, refresh tokens, browser cookies, or keyring entries.
- **No private dashboard APIs.** Do not automate ChatGPT/Codex browser sessions to recover quota.
- **Visible billing mode.** Make “ChatGPT subscription” versus “API key” unmistakable before launch so a user cannot accidentally incur API spend.
- **No false aggregation.** Percentages from different windows/plans/models are not a common currency. Present per-account meters and reset times, not a misleading universal “messages remaining” number.

These are product-risk recommendations, not legal advice. Before distributing automated multi-account switching beyond a local personal tool, obtain policy/legal review and, ideally, written provider guidance.

### Recommended V1 scope for OpenAI

Ship:

1. One isolated `CODEX_HOME` and official login per account.
2. One local app-server child per active monitored profile.
3. `account/read`, `account/rateLimits/read`, and rate-limit update subscriptions.
4. Manual **Launch** / **Switch** that starts or focuses an account-specific Codex process.
5. Stale/partial state, reset countdowns, threshold notifications, and a link to the official usage dashboard.
6. A clear separation between subscription quota, credits, and API billing.

Defer or reject:

- copying/swapping `auth.json`, browser-cookie import, private web endpoints, or dashboard scraping;
- automatic prompt/job failover across subscriptions;
- changing the identity of a running session;
- cloud synchronization of consumer credentials;
- enterprise analytics until there is a separately designed admin-authorized adapter; and
- converting variable-cost model use into a fabricated exact “prompts remaining” count.

---

## Cross-provider product architecture

### Capability matrix

| Capability | Claude Code subscription | Codex / ChatGPT subscription |
|---|---|---|
| Supported machine-readable remaining quota | Status-line input after a model response: five-hour and seven-day percentage/reset | App-server `account/rateLimits/read` plus update notifications |
| Passive refresh while idle | No reliable complete source; last observation may become stale | Yes, from a local app-server, subject to version/account availability |
| Official human check | `/usage` and Settings → Usage | `/status` and Codex usage dashboard |
| Auth status | `claude auth status --json` | `account/read` or `codex login status` |
| Isolated multi-account boundary | One `CLAUDE_CONFIG_DIR` per profile | One `CODEX_HOME` per profile |
| Native first-class account switcher | No; launch separate configured process | No Codex profile switcher; web ChatGPT switcher is separate and limited |
| Safe “switch” semantic | Explicitly launch/focus selected profile | Explicitly launch/focus selected profile |
| Main incompleteness | No idle/public quota API; not every Max weekly limit is in status-line schema | Variable task cost; secondary windows/credits can differ by account and plan |

### Local-first component model

```text
┌──────────────────────────── Desktop UI ────────────────────────────┐
│ account cards · quota meters · reset times · stale/partial badges │
│ explicit Launch/Switch · notifications · official verification    │
└───────────────────────────────┬────────────────────────────────────┘
                                │ localhost-only IPC / named pipe
┌───────────────────────────────▼────────────────────────────────────┐
│ Local broker                                                       │
│ profile registry · snapshot store · scheduler · redacted logging  │
│ process supervisor · per-profile lock · notification policy       │
└───────────────┬──────────────────────────────────┬─────────────────┘
                │ exact per-process env            │ exact per-process env
┌───────────────▼────────────────┐  ┌──────────────▼─────────────────┐
│ Claude adapter                │  │ OpenAI adapter                 │
│ CLAUDE_CONFIG_DIR             │  │ CODEX_HOME                     │
│ auth status / status-line     │  │ app-server account/rateLimits │
│ official Claude Code process  │  │ official Codex process        │
└────────────────────────────────┘  └────────────────────────────────┘
```

Use a provider interface whose contract reflects uncertainty instead of erasing it:

```ts
interface ProviderAdapter {
  listProfiles(): Promise<ProfileSummary[]>;
  getAuthStatus(profileId: string): Promise<AuthStatus>;
  getQuotaSnapshot(profileId: string): Promise<QuotaSnapshot>;
  beginLogin(profileId: string): Promise<LoginFlow>;
  logout(profileId: string): Promise<void>;
  launchProfile(profileId: string, workspace?: string): Promise<LaunchResult>;
}

interface QuotaWindow {
  providerWindowId?: string;
  label: string;
  durationMinutes?: number;
  usedPercent?: number;
  resetsAt?: string;
  limitReached?: boolean;
}

interface QuotaSnapshot {
  source: "claude-statusline" | "codex-app-server";
  observedAt: string;
  windows: QuotaWindow[];
  stale: boolean;
  partial: boolean;
  unavailableReason?: string;
}
```

The local database should contain profile IDs, display names, provider, isolated-home path, masked identity, plan label, last snapshots, and UI preferences only. Credential files and keyring contents remain opaque provider-owned state. Protect the database with the current OS user's ACL; if full identity is retained, encrypt it with an OS-user-bound mechanism. Keep any IPC endpoint local and authenticated to the same user.

### UX rules that prevent expensive mistakes

- Put the provider, masked account identity, plan, auth mode, quota freshness, and current workspace on every account card.
- Use independent meters per returned window with both percentage and absolute reset time; do not merge Claude and Codex into one score.
- Use explicit states: **Fresh**, **Stale**, **Partial**, **Needs first Claude response**, **Signed out**, **Unavailable**, and **Awaiting refresh**.
- Make **Launch** the primary word. If the UI says **Switch**, the confirmation must explain that it starts/focuses another profile and does not move a running conversation.
- Require confirmation when launching an API-key profile or when the selected identity differs from the profile's last verified identity.
- Notifications should say “Account A five-hour window is 85% used” or “Account B resets at 14:32,” never “work moved to Account B.”
- Keep account recommendation advisory and user-triggered. Do not automatically execute prompts, retry work, or choose another subscription.

### Platform and stack implications

This integration needs reliable process spawning, per-child environment isolation, local IPC, OS credential-safe boundaries, notifications, and tray behavior. A local Windows desktop application is therefore the right first platform; a hosted web app would either lose the supported local CLI surfaces or require unsafe credential upload.

The provider layer should be a separate process or deep module with a narrow typed contract, so a UI framework can be changed without touching credential/profile logic. The final stack decision can be made in the project architecture document, but any acceptable stack must support:

- Windows process supervision without shell interpolation;
- per-profile environment maps and job/process cleanup;
- named-pipe or loopback-only IPC;
- atomic local storage and schema migrations;
- tray/status notifications; and
- signed, reproducible desktop releases.

Rust plus a small web-view shell is an attractive security/distribution option; TypeScript/Electron is faster for UI iteration but carries a larger runtime and a wider dependency/update surface. Either can implement the safe design. The provider research does not justify a cloud backend for V1.

---

## Open-source implementation evidence (secondary, not policy authority)

These projects are useful implementation evidence only. Their existence does not make every technique provider-supported.

| Project | Useful evidence | Do not copy |
|---|---|---|
| [CodexBar](https://github.com/steipete/codexbar) | Mature multi-provider adapter pattern, per-window reset countdowns, threshold/stale states, local-first presentation | Optional browser-cookie/private-endpoint or credential-discovery paths; use only documented provider surfaces |
| [aisw](https://github.com/burakdede/aisw) | Cross-platform launcher pattern using isolated `CODEX_HOME` and `CLAUDE_CONFIG_DIR`, fresh processes, and workspace/context guards | Live credential snapshot/import or copying provider auth state; run official login independently in every profile |
| [ClaudeBar](https://github.com/tddworks/ClaudeBar) | A small provider-specific status UI and CLI-probe separation | Treating a third-party parser or undocumented surface as an entitlement API |

Before borrowing code, pin a commit, review its license and dependency tree, and independently test it against the official CLI version being supported. Use these repositories for interaction patterns and process isolation—not for policy, quota promises, or authentication shortcuts.

---

## V1 decision

Build a **single-user, local-first Windows tray application** whose sole powers are to observe supported quota signals, retain non-secret snapshots, notify the user, and explicitly launch/focus an isolated official CLI profile.

The V1 success criteria are:

1. Add multiple Claude and Codex profiles through the providers' official interactive login flows.
2. Never read or copy credential material.
3. Display provider-specific quota windows with reset times, provenance, freshness, and incomplete-state language.
4. Launch the selected CLI in a fresh process with only that profile's `CLAUDE_CONFIG_DIR` or `CODEX_HOME`.
5. Make the active identity and billing mode obvious before work begins.
6. Alert and recommend, but never automatically route work around a limit.
7. Operate without a cloud service, LAN listener, browser scraping, or private API dependency.

This scope produces a genuinely useful account dashboard and launcher while staying inside the strongest documented local surfaces. Automatic cross-account failover, cloud credential synchronization, browser-session extraction, and exact cross-provider “remaining prompts” estimates should be explicit non-goals.

## Research date and change risk

This report reflects official documentation and official-source repository material checked on **2026-07-18**. Subscription tiers, quotas, RPC fields, CLI storage behavior, and provider policies are change-prone. Revalidate the linked primary sources, pin the supported CLI versions, and include adapter capability/version checks before release. Where the official source gives an approximate range or an incomplete schema, the product must preserve that uncertainty rather than infer a stronger guarantee.
