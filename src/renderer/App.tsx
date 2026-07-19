import {
  Activity,
  ArrowRight,
  Check,
  CircleHelp,
  LayoutDashboard,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  StarOff,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AccountSnapshot,
  AlertThreshold,
  DashboardSnapshot,
  ProviderCapabilities,
  ProviderId,
  QuotaWindow,
} from "../shared/contracts";
import {
  loadPinnedIds,
  loadRecentIds,
  recordRecent,
  togglePinned,
} from "./account-preferences";
import { demoDashboard } from "./demo-data";

const providerMeta: Record<
  ProviderId,
  { mark: string; label: string; accent: string }
> = {
  claude: { mark: "A", label: "Claude", accent: "warm" },
  codex: { mark: "O", label: "Codex", accent: "cool" },
};

function titleCase(value: string | null): string {
  if (!value) return "Plan unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Electron rejects a failed invoke with a message framed as
// "Error invoking remote method 'channel': Error: <message>". Strip that
// transport wrapper so the user sees only the curated validation sentence the
// main process threw — never Electron internals or a channel name.
function friendlyBridgeError(caught: unknown, fallback: string): string {
  if (!(caught instanceof Error) || !caught.message) return fallback;
  const stripped = caught.message
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    .replace(/^(?:[A-Za-z]+Error):\s*/, "")
    .trim();
  return stripped.length > 0 ? stripped : fallback;
}

function relativeTime(value: string): string {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 1_000),
  );
  if (seconds < 15) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function resetLabel(value: string | null): string {
  if (!value) return "Reset time unavailable";
  const date = new Date(value);
  const delta = date.getTime() - Date.now();
  if (delta <= 0) return "Awaiting refresh";
  const hours = Math.floor(delta / 3_600_000);
  const days = Math.floor(hours / 24);
  const absolute = date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (days > 0) return `Resets in ${days}d ${hours % 24}h · ${absolute}`;
  return `Resets in ${hours}h · ${absolute}`;
}

function availablePercent(account: AccountSnapshot): number | null {
  if (!account.quotaWindows.length) return null;
  return Math.min(
    ...account.quotaWindows.map((window) =>
      Math.max(0, 100 - window.usedPercent),
    ),
  );
}

function recommendedAccountForProvider(
  accounts: AccountSnapshot[],
  provider: ProviderId,
): AccountSnapshot | undefined {
  return accounts
    .filter(
      (account) =>
        account.provider === provider &&
        account.billingMode === "subscription" &&
        account.quotaStatus === "fresh" &&
        availablePercent(account) !== null,
    )
    .sort(
      (left, right) =>
        (availablePercent(right) ?? -1) - (availablePercent(left) ?? -1),
    )[0];
}

const quotaStatusLabels = {
  fresh: "Fresh",
  stale: "Stale",
  partial: "Partial",
  "needs-first-response": "Needs first response",
  "awaiting-refresh": "Awaiting refresh",
  "signed-out": "Signed out",
  unavailable: "Unavailable",
} as const;

const billingModeLabels = {
  subscription: "Subscription",
  api: "API billing",
  external: "External billing",
  unknown: "Billing unknown",
} as const;

const authModeLabels = {
  subscription: "Subscription login",
  "api-key": "API key login",
  "external-provider": "External provider",
  unknown: "Auth unknown",
  "signed-out": "Signed out",
} as const;

// A managed profile routes through the official sign-in flow ("Set up this
// account") until its lifecycle reaches a launchable state. This is driven by
// the explicit lifecycle — never re-derived from authMode — so a brand-new
// profile (or one whose CLI probe failed) never shows a launch that would only
// be blocked by the identity/billing safety gate.
function accountNeedsSetup(account: AccountSnapshot): boolean {
  return (
    account.isManaged &&
    (account.lifecycle === "pending-login" ||
      account.lifecycle === "signed-out" ||
      account.lifecycle === "provider-error")
  );
}

// A specific reason the quota number is absent, replacing a generic
// "Quota hidden". Order matters: the most actionable state wins.
function quotaAvailabilityLabel(account: AccountSnapshot): string {
  const remaining = availablePercent(account);
  if (remaining !== null) return `${Math.round(remaining)}% free`;
  if (
    account.lifecycle === "signed-out" ||
    account.lifecycle === "pending-login" ||
    account.authMode === "signed-out"
  ) {
    return "Signed out";
  }
  if (account.lifecycle === "provider-error") return "CLI unavailable";
  if (account.quotaStatus === "needs-first-response")
    return "Awaiting first response";
  if (account.billingMode === "api" || account.billingMode === "external")
    return "API billing";
  return "Provider data unavailable";
}

// A three-way tone plus accessible text for the account status indicator, so it
// is not always green and screen readers get a meaningful label.
function accountStatus(account: AccountSnapshot): {
  tone: "ok" | "warn" | "error";
  text: string;
} {
  if (account.lifecycle === "provider-error") {
    return { tone: "error", text: "Provider CLI unavailable" };
  }
  if (account.state === "limited") {
    return { tone: "warn", text: "Quota limit reached" };
  }
  if (
    account.lifecycle === "pending-login" ||
    account.lifecycle === "signed-out"
  ) {
    return { tone: "warn", text: "Signed out — set up required" };
  }
  if (account.lifecycle === "authenticated-unverified") {
    return { tone: "warn", text: "Awaiting identity confirmation" };
  }
  if (account.lifecycle === "verified" && account.state === "ready") {
    return { tone: "ok", text: "Ready" };
  }
  return { tone: "warn", text: "Status unavailable" };
}

// A coarse, filterable category for the Accounts management destination.
type AccountCategory = "ready" | "needs-setup" | "issue" | "attention";

function accountCategory(account: AccountSnapshot): AccountCategory {
  if (account.lifecycle === "provider-error") return "issue";
  if (accountNeedsSetup(account)) return "needs-setup";
  if (account.lifecycle === "verified" && account.state === "ready") {
    return "ready";
  }
  return "attention";
}

function useModalDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    const focusableSelector =
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    queueMicrotask(() => {
      if (!dialogRef.current?.contains(document.activeElement)) {
        dialogRef.current
          ?.querySelector<HTMLElement>(focusableSelector)
          ?.focus();
      }
    });
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [onClose]);

  return dialogRef;
}

// The signature instrument: a radial ring dial reading available runway as a
// fuel gauge. The tabular percentage in the center is the one confident moment
// per window; the fill turns amber/clay only when the tank runs critically low.
// Geometry is a plain SVG donut; the accessible progressbar name is unchanged.
const GAUGE_SIZE = 92;
const GAUGE_STROKE = 9;
const GAUGE_RADIUS = (GAUGE_SIZE - GAUGE_STROKE) / 2;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

function QuotaMeter({
  window,
  accountName,
}: {
  window: QuotaWindow;
  accountName: string;
}) {
  const available = Math.max(0, Math.round(100 - window.usedPercent));
  const used = Math.round(window.usedPercent);
  const tone = available <= 10 ? "crit" : available <= 25 ? "low" : "ok";
  const center = GAUGE_SIZE / 2;
  return (
    <div className="quota-meter">
      <div
        className="gauge"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={available}
        aria-label={`${accountName} — ${window.label}: ${available}% available, ${used}% used. ${resetLabel(
          window.resetsAt,
        )}`}
      >
        <svg
          className="gauge-svg"
          viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
          aria-hidden="true"
          focusable="false"
        >
          <circle
            className="gauge-track"
            cx={center}
            cy={center}
            r={GAUGE_RADIUS}
            fill="none"
            strokeWidth={GAUGE_STROKE}
          />
          <circle
            className={`gauge-fill gauge-fill-${tone}`}
            cx={center}
            cy={center}
            r={GAUGE_RADIUS}
            fill="none"
            strokeWidth={GAUGE_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${(available / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <div className="gauge-readout">
          <span className="gauge-value">
            {available}
            <i>%</i>
          </span>
          <span className="gauge-caption">available</span>
        </div>
      </div>
      <div className="gauge-meta">
        <span className="meter-window">{window.label}</span>
        <span className="meter-reset">{resetLabel(window.resetsAt)}</span>
      </div>
    </div>
  );
}

function AccountCard({
  account,
  onRemove,
  onRename,
  onVerifyUsage,
  ambiguous = false,
  pinned,
  onTogglePin,
  onAction,
}: {
  account: AccountSnapshot;
  onRemove: (account: AccountSnapshot) => Promise<void>;
  onRename: (account: AccountSnapshot) => void;
  onVerifyUsage: (provider: ProviderId) => Promise<void>;
  ambiguous?: boolean;
  pinned?: boolean;
  onTogglePin?: (account: AccountSnapshot) => void;
  onAction?: (account: AccountSnapshot) => Promise<void>;
}) {
  const meta = providerMeta[account.provider];
  const status = accountStatus(account);
  const needsSetup = accountNeedsSetup(account);

  return (
    <article
      className={`account-card accent-${meta.accent}`}
      aria-label={`${account.displayName} account`}
    >
      <div className="account-card-top">
        <div className="provider-identity">
          <span className="provider-mark">{meta.mark}</span>
          <div className="provider-identity-text">
            <h3>{account.displayName}</h3>
            {ambiguous && (
              <span className="account-disambiguator">
                {account.identity ?? `#${account.id.slice(0, 8)}`}
              </span>
            )}
          </div>
        </div>
        <div className="account-card-actions">
          <span
            className={`provider-live-dot tone-${status.tone}`}
            title={status.text}
            role="img"
            aria-label={`${account.displayName} status: ${status.text}`}
          />
          {onTogglePin && (
            <button
              className={`pin-profile-button ${pinned ? "pinned" : ""}`}
              onClick={() => onTogglePin(account)}
              aria-label={
                pinned
                  ? `Unpin ${account.displayName}`
                  : `Pin ${account.displayName}`
              }
              aria-pressed={pinned}
              title={pinned ? "Unpin account" : "Pin account"}
            >
              {pinned ? <Star size={14} /> : <StarOff size={14} />}
            </button>
          )}
          {account.isManaged && (
            <button
              className="rename-profile-button"
              onClick={() => onRename(account)}
              aria-label={`Rename ${account.displayName}`}
              title="Rename managed profile"
            >
              <Pencil size={14} />
            </button>
          )}
          {account.isManaged && (
            <button
              className="remove-profile-button"
              onClick={() => void onRemove(account)}
              aria-label={`Remove ${account.displayName}`}
              title="Remove managed profile"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="account-safety-row">
        <span className="account-identity">
          <span className="ident-label">Identity</span>
          <span className="ident-value">
            {account.identity ?? "Not reported"}
          </span>
        </span>
        {account.isManaged && (
          <small className={account.identityVerified ? "verified" : "pending"}>
            {account.identityVerified ? "Verified" : "Verify before launch"}
          </small>
        )}
      </div>

      <div className="account-meta-row">
        <span className="card-tag">{titleCase(account.plan)}</span>
        <span className="card-tag">{authModeLabels[account.authMode]}</span>
        {account.billingMode !== "subscription" && (
          <span className="card-tag tone-warn">
            {billingModeLabels[account.billingMode]}
          </span>
        )}
        <span
          className={`card-tag ${account.state === "limited" ? "tone-warn" : ""}`}
        >
          {account.state === "limited"
            ? "Limited"
            : quotaStatusLabels[account.quotaStatus]}
        </span>
      </div>

      {account.quotaWindows.length ? (
        <div className="quota-stack">
          {account.quotaWindows.map((window) => (
            <QuotaMeter
              key={window.id}
              window={window}
              accountName={account.displayName}
            />
          ))}
        </div>
      ) : (
        <div className="unavailable-meter">
          <div className="unavailable-icon">
            <CircleHelp size={19} />
          </div>
          <div>
            <strong>Exact quota unavailable</strong>
            <p>
              The provider does not expose a supported structured quota feed for
              this account.
            </p>
          </div>
        </div>
      )}

      {account.notice && <p className="account-notice">{account.notice}</p>}

      <div className="source-row">
        <span className="source-provenance">
          {account.source.label} · {relativeTime(account.source.observedAt)}
        </span>
        <button
          type="button"
          className="usage-help-button"
          onClick={() => void onVerifyUsage(account.provider)}
          aria-label={`Open official ${meta.label} usage instructions`}
        >
          {account.provider === "claude"
            ? "Verify /usage"
            : "Verify in Settings"}
        </button>
      </div>

      {onAction && (
        <button
          type="button"
          className="card-primary-action"
          onClick={() => void onAction(account)}
        >
          {needsSetup ? "Set up this account" : `Launch ${meta.label} session`}
          <ArrowRight size={15} />
        </button>
      )}
    </article>
  );
}

function SmartSwitcher({
  accounts,
  onAction,
  shortcutModifier,
  pinnedIds,
}: {
  accounts: AccountSnapshot[];
  onAction: (account: AccountSnapshot) => Promise<void>;
  shortcutModifier: "Ctrl" | "⌘";
  pinnedIds: Set<string>;
}) {
  // Pins float to the top here too, matching the Accounts view — a stable sort
  // keeps the provider's original order among equally-pinned accounts.
  const ordered = useMemo(
    () =>
      [...accounts].sort(
        (left, right) =>
          (pinnedIds.has(right.id) ? 1 : 0) - (pinnedIds.has(left.id) ? 1 : 0),
      ),
    [accounts, pinnedIds],
  );
  const [selected, setSelected] = useState(accounts[0]?.id ?? "");
  const [isLaunching, setIsLaunching] = useState(false);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedAccount = ordered.find((account) => account.id === selected);
  const needsSetup = selectedAccount
    ? accountNeedsSetup(selectedAccount)
    : false;

  const handleAction = async () => {
    if (!selectedAccount) return;
    setIsLaunching(true);
    try {
      await onAction(selectedAccount);
    } finally {
      setIsLaunching(false);
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const modifierPressed =
        shortcutModifier === "⌘" ? event.metaKey : event.ctrlKey;
      if (modifierPressed && event.key.toLowerCase() === "k") {
        event.preventDefault();
        optionRefs.current[0]?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [shortcutModifier]);

  return (
    <aside className="switcher-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Workspace</span>
          <h2>Smart switcher</h2>
        </div>
        <span className="shortcut" aria-hidden="true">
          {shortcutModifier} K
        </span>
      </div>
      <p className="panel-intro">
        Choose an account, verify its identity and billing mode, then launch a
        separate session.
      </p>

      <div
        className="switcher-list"
        role="listbox"
        aria-label="AI accounts"
        aria-keyshortcuts={shortcutModifier === "⌘" ? "Meta+K" : "Control+K"}
      >
        {ordered.map((account, index) => {
          const meta = providerMeta[account.provider];
          const available = quotaAvailabilityLabel(account);
          const isSelected = account.id === selectedAccount?.id;
          return (
            <button
              className={`switcher-item ${isSelected ? "selected" : ""}`}
              key={account.id}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              onClick={() => setSelected(account.id)}
              onKeyDown={(event) => {
                let nextIndex: number | null = null;
                if (event.key === "ArrowDown")
                  nextIndex = (index + 1) % ordered.length;
                if (event.key === "ArrowUp")
                  nextIndex = (index - 1 + ordered.length) % ordered.length;
                if (event.key === "Home") nextIndex = 0;
                if (event.key === "End") nextIndex = ordered.length - 1;
                if (nextIndex === null) return;
                event.preventDefault();
                const nextAccount = ordered[nextIndex];
                if (nextAccount) setSelected(nextAccount.id);
                optionRefs.current[nextIndex]?.focus();
              }}
              role="option"
              aria-selected={isSelected}
              // Roving tabindex: only the selected option is in the tab order;
              // arrow keys move selection and focus across the rest.
              tabIndex={isSelected ? 0 : -1}
            >
              <span className={`provider-mark small accent-${meta.accent}`}>
                {meta.mark}
              </span>
              <span className="switcher-copy">
                <strong>{account.displayName}</strong>
                <small>
                  {account.identity ?? "Identity unknown"} ·{" "}
                  {billingModeLabels[account.billingMode]} · {available}
                </small>
              </span>
              {isSelected && (
                <span className="selected-check">
                  <Check size={13} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button
        className="primary-action"
        disabled={!selectedAccount || isLaunching}
        onClick={() => void handleAction()}
      >
        {isLaunching
          ? "Opening…"
          : needsSetup
            ? "Set up this account"
            : `Launch ${selectedAccount ? providerMeta[selectedAccount.provider].label : "account"}`}
        <ArrowRight size={17} />
      </button>
      <p className="safety-note">
        <ShieldCheck size={14} /> Launching starts a separate profile process.
        QuotaDeck never copies raw tokens.
      </p>
    </aside>
  );
}

function AddProfileDialog({
  onClose,
  onAdded,
  capabilities,
}: {
  onClose: () => void;
  onAdded: (dashboard: DashboardSnapshot) => void;
  capabilities: ProviderCapabilities;
}) {
  const dialogRef = useModalDialog(onClose);
  const [provider, setProvider] = useState<ProviderId>(() =>
    capabilities.claude.managedProfiles ? "claude" : "codex",
  );
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!capabilities[provider].managedProfiles) {
      setError(
        capabilities[provider].reason ?? "This profile type is unavailable.",
      );
      return;
    }
    const bridge = window.quotaMonitor;
    if (!bridge) {
      setError(
        "Account creation is available in the desktop app, not browser preview mode.",
      );
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      onAdded(await bridge.addProfile({ provider, displayName }));
      onClose();
    } catch (caught) {
      setError(
        friendlyBridgeError(caught, "Account profile could not be created."),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Isolated profile</span>
            <h2 id="add-profile-title">Add an AI account</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p>
          QuotaDeck creates a pending login workspace. You will sign in through
          the provider's official flow; credentials stay provider-owned. The
          workspace becomes a verified account only after you confirm its masked
          identity before first launch.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <fieldset className="provider-fieldset">
            <legend>Provider</legend>
            <div className="provider-choice">
              {(["claude", "codex"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={provider === value ? "selected" : ""}
                  onClick={() => setProvider(value)}
                  disabled={!capabilities[value].managedProfiles}
                  title={capabilities[value].reason ?? undefined}
                  aria-pressed={provider === value}
                >
                  <span
                    className={`provider-mark small accent-${providerMeta[value].accent}`}
                  >
                    {providerMeta[value].mark}
                  </span>
                  {providerMeta[value].label}
                  {provider === value && <Check size={14} />}
                </button>
              ))}
            </div>
          </fieldset>
          {!capabilities.claude.managedProfiles && (
            <div className="form-notice">{capabilities.claude.reason}</div>
          )}
          <label htmlFor="profile-name">Account label</label>
          <input
            id="profile-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="e.g. Claude — Client work"
            autoFocus
            maxLength={48}
          />
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-action"
              disabled={isSaving || displayName.trim().length < 2}
            >
              {isSaving ? "Creating…" : "Create login workspace"}{" "}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RenameProfileDialog({
  account,
  onClose,
  onRenamed,
}: {
  account: AccountSnapshot;
  onClose: () => void;
  onRenamed: (message: string) => void;
}) {
  const dialogRef = useModalDialog(onClose);
  const [displayName, setDisplayName] = useState(account.displayName);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const bridge = window.quotaMonitor;
    if (!bridge) {
      setError(
        "Renaming is available in the desktop app, not browser preview.",
      );
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const result = await bridge.renameProfile(account.id, displayName);
      if (result.ok) {
        onRenamed(result.message);
        onClose();
      } else {
        setError(result.message);
      }
    } catch {
      setError("The account could not be renamed. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">
              {providerMeta[account.provider].label}
            </span>
            <h2 id="rename-profile-title">Rename account</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p>
          Renaming changes only the local label. Sign-in, quota, and the
          isolated provider home are unaffected.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="rename-profile-name">Account label</label>
          <input
            id="rename-profile-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoFocus
            maxLength={48}
          />
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-action"
              disabled={
                isSaving ||
                displayName.trim().length < 2 ||
                displayName.trim() === account.displayName
              }
            >
              {isSaving ? "Saving…" : "Save label"} <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CliSettingsDialog({
  dashboard,
  onClose,
  onChanged,
  onAlertThresholdSaved,
}: {
  dashboard: DashboardSnapshot;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onAlertThresholdSaved: (threshold: AlertThreshold) => void;
}) {
  const dialogRef = useModalDialog(onClose);
  const [message, setMessage] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<ProviderId | null>(null);
  // Optimistic local threshold so the control updates immediately and never
  // shows the old value beside a success message for the new one.
  const [threshold, setThreshold] = useState<AlertThreshold>(
    dashboard.alertThresholdPercent,
  );
  const [alertStatus, setAlertStatus] = useState<"idle" | "saving" | "saved">(
    "idle",
  );

  const changeCommand = async (provider: ProviderId, reset: boolean) => {
    const bridge = window.quotaMonitor;
    if (!bridge) {
      setMessage("Executable selection is available in the desktop app.");
      return;
    }
    setBusyProvider(provider);
    try {
      const result = reset
        ? await bridge.resetCliExecutable(provider)
        : await bridge.chooseCliExecutable(provider);
      setMessage(result.message);
      if (result.ok) await onChanged();
    } catch {
      setMessage("QuotaDeck could not update the CLI setting. Try again.");
    } finally {
      setBusyProvider(null);
    }
  };

  const recheckCommand = async (provider: ProviderId) => {
    const bridge = window.quotaMonitor;
    if (!bridge) {
      setMessage("CLI detection is available in the desktop app.");
      return;
    }
    setBusyProvider(provider);
    try {
      const result = await bridge.recheckCliExecutable(provider);
      setMessage(result.message);
      await onChanged();
    } catch {
      setMessage("QuotaDeck could not re-check the CLI. Try again.");
    } finally {
      setBusyProvider(null);
    }
  };

  const openInstall = async (provider: ProviderId) => {
    const bridge = window.quotaMonitor;
    if (!bridge) {
      setMessage("Install instructions are available in the desktop app.");
      return;
    }
    try {
      const result = await bridge.openCliInstallInstructions(provider);
      setMessage(result.message);
    } catch {
      setMessage("QuotaDeck could not open the install instructions.");
    }
  };

  const changeAlertThreshold = async (value: string) => {
    const bridge = window.quotaMonitor;
    const next: AlertThreshold =
      value === "off" ? null : (Number(value) as 75 | 85 | 95);
    const previous = threshold;
    // Update the UI immediately; roll back only if persistence fails. Saving a
    // preference never waits for a full provider dashboard collection.
    setThreshold(next);
    setMessage(null);
    if (!bridge) {
      setThreshold(previous);
      setMessage("Local alert settings are available in the desktop app.");
      return;
    }
    setAlertStatus("saving");
    try {
      const result = await bridge.setAlertThreshold(next);
      if (result.ok) {
        setAlertStatus("saved");
        onAlertThresholdSaved(next);
      } else {
        setThreshold(previous);
        setAlertStatus("idle");
        setMessage(result.message);
      }
    } catch {
      setThreshold(previous);
      setAlertStatus("idle");
      setMessage("QuotaDeck could not update the local alert setting.");
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="profile-dialog cli-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cli-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Device compatibility</span>
            <h2 id="cli-settings-title">CLI settings</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p>
          QuotaDeck normally discovers official CLIs from the application PATH.
          Choose an executable only when automatic discovery fails.
        </p>
        <div className="cli-status-list">
          {(["claude", "codex"] as const).map((provider) => {
            const status = dashboard.cliStatus[provider];
            const name = provider === "claude" ? "Claude Code" : "Codex";
            const ready = status.callable && status.compatible;
            const guidance = status.installGuidance;
            return (
              <article className="cli-status-card" key={provider}>
                <div>
                  <strong>{name}</strong>
                  <span className={ready ? "cli-ready" : "cli-missing"}>
                    {ready
                      ? "Ready"
                      : status.callable
                        ? "Update needed"
                        : "Needs setup"}
                  </span>
                </div>
                <p>{status.version ?? status.message}</p>
                <small>
                  {status.source === "custom"
                    ? "Selected executable"
                    : "Application PATH"}
                </small>
                {!ready && (
                  // Setup guidance is grounded in the providers' official docs
                  // and only appears when the CLI is missing or incompatible.
                  <div className="cli-setup-guide">
                    <p className="cli-setup-headline">{guidance.headline}</p>
                    <dl className="cli-setup-steps">
                      <dt>Install (Windows)</dt>
                      <dd>
                        <code>{guidance.windowsCommand}</code>
                      </dd>
                      <dt>Sign in</dt>
                      <dd>{guidance.signIn}</dd>
                      <dt>Verify</dt>
                      <dd>
                        <code>{guidance.verify}</code>
                      </dd>
                    </dl>
                    {guidance.note && (
                      <p className="cli-setup-note">{guidance.note}</p>
                    )}
                  </div>
                )}
                <div className="cli-status-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    disabled={busyProvider !== null}
                    onClick={() => void changeCommand(provider, false)}
                    aria-label={`Choose ${name} executable`}
                  >
                    Choose executable
                  </button>
                  <button
                    type="button"
                    className="text-action"
                    disabled={busyProvider !== null}
                    onClick={() => void recheckCommand(provider)}
                    aria-label={`Re-check ${name}`}
                  >
                    {busyProvider === provider ? "Checking…" : "Recheck"}
                  </button>
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => void openInstall(provider)}
                    aria-label={`Open ${name} install instructions`}
                  >
                    Install guide
                  </button>
                  {status.source === "custom" && (
                    <button
                      type="button"
                      className="text-action"
                      disabled={busyProvider !== null}
                      onClick={() => void changeCommand(provider, true)}
                    >
                      Use PATH
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <div className="alert-settings-row">
          <div>
            <strong>Local quota alerts</strong>
            <p>
              Notify only for fresh, provider-reported subscription usage.
              QuotaDeck never alerts from stale or API-billed data.
            </p>
          </div>
          <label>
            <span>Alert threshold</span>
            <select
              aria-label="Local quota alert threshold"
              value={threshold ?? "off"}
              onChange={(event) =>
                void changeAlertThreshold(event.currentTarget.value)
              }
            >
              <option value="off">Off</option>
              <option value="75">75% used</option>
              <option value="85">85% used</option>
              <option value="95">95% used</option>
            </select>
            {alertStatus !== "idle" && (
              <span className="save-status" role="status">
                {alertStatus === "saving" ? "Saving…" : "Saved"}
              </span>
            )}
          </label>
        </div>
        {message && (
          <p className="dialog-status" role="status">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}

type ToastState = {
  message: string;
  tone: "info" | "error";
  action?: { label: string; run: () => void };
};

// A persistent, accessible notification region rendered outside the responsive
// switcher so it stays visible at every width and never follows the selected
// account. Errors assert; informational updates are polite status.
function ToastRegion({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  if (!toast) return null;
  return (
    <div className="toast-region">
      <div
        className={`toast tone-${toast.tone}`}
        role={toast.tone === "error" ? "alert" : "status"}
      >
        <span className="toast-message">{toast.message}</span>
        {toast.action && (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              toast.action!.run();
              onDismiss();
            }}
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          className="toast-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

type ProviderFilter = "all" | ProviderId;
type StatusFilter = "all" | "ready" | "needs-setup" | "issue";
type AccountSort = "recommended" | "name" | "provider" | "recent";

const statusFilterLabels: Record<StatusFilter, string> = {
  all: "All statuses",
  ready: "Ready",
  "needs-setup": "Needs setup",
  issue: "Needs attention",
};

const sortLabels: Record<AccountSort, string> = {
  recommended: "Recommended",
  name: "Name (A–Z)",
  provider: "Provider",
  recent: "Recently used",
};

// The Accounts management destination: a searchable, filterable, sortable list
// that scales to large collections. Pinned accounts always float to the top;
// the rest follow the chosen sort. Bounded scrolling keeps 12+ accounts usable.
function AccountsView({
  accounts,
  pinnedIds,
  recentIds,
  ambiguousLabelKeys,
  shortcutModifier,
  onAction,
  onRemove,
  onRename,
  onVerifyUsage,
  onTogglePin,
}: {
  accounts: AccountSnapshot[];
  pinnedIds: Set<string>;
  recentIds: string[];
  ambiguousLabelKeys: Set<string>;
  shortcutModifier: "Ctrl" | "⌘";
  onAction: (account: AccountSnapshot) => Promise<void>;
  onRemove: (account: AccountSnapshot) => Promise<void>;
  onRename: (account: AccountSnapshot) => void;
  onVerifyUsage: (provider: ProviderId) => Promise<void>;
  onTogglePin: (account: AccountSnapshot) => void;
}) {
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<AccountSort>("recommended");
  const searchRef = useRef<HTMLInputElement>(null);

  // The switcher's Ctrl/⌘+K only exists on the Overview; mirror it here so the
  // same shortcut jumps to the search box while the Accounts view is open.
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const modifierPressed =
        shortcutModifier === "⌘" ? event.metaKey : event.ctrlKey;
      if (modifierPressed && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [shortcutModifier]);

  const recentRank = useMemo(() => {
    const rank = new Map<string, number>();
    recentIds.forEach((id, index) => rank.set(id, index));
    return rank;
  }, [recentIds]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matches = accounts.filter((account) => {
      if (providerFilter !== "all" && account.provider !== providerFilter) {
        return false;
      }
      if (statusFilter !== "all" && accountCategory(account) !== statusFilter) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        account.displayName,
        account.identity ?? "",
        providerMeta[account.provider].label,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(needle);
    });

    const byName = (left: AccountSnapshot, right: AccountSnapshot) =>
      left.displayName.localeCompare(right.displayName);
    const compare = (left: AccountSnapshot, right: AccountSnapshot): number => {
      // Pins win regardless of the chosen sort, so favorites stay reachable.
      const leftPinned = pinnedIds.has(left.id) ? 0 : 1;
      const rightPinned = pinnedIds.has(right.id) ? 0 : 1;
      if (leftPinned !== rightPinned) return leftPinned - rightPinned;
      if (sort === "name") return byName(left, right);
      if (sort === "provider") {
        return (
          left.provider.localeCompare(right.provider) || byName(left, right)
        );
      }
      if (sort === "recent") {
        const leftRank = recentRank.get(left.id) ?? Number.POSITIVE_INFINITY;
        const rightRank = recentRank.get(right.id) ?? Number.POSITIVE_INFINITY;
        if (leftRank !== rightRank) return leftRank - rightRank;
        return byName(left, right);
      }
      // Recommended: most available fresh subscription runway first.
      const leftAvailable = availablePercent(left) ?? -1;
      const rightAvailable = availablePercent(right) ?? -1;
      if (leftAvailable !== rightAvailable)
        return rightAvailable - leftAvailable;
      return byName(left, right);
    };
    return [...matches].sort(compare);
  }, [
    accounts,
    pinnedIds,
    providerFilter,
    query,
    recentRank,
    sort,
    statusFilter,
  ]);

  return (
    <section className="accounts-view" aria-label="Account management">
      <div className="accounts-toolbar">
        <div className="accounts-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search by name, identity, or provider"
            aria-label="Search accounts"
            aria-keyshortcuts={
              shortcutModifier === "⌘" ? "Meta+K" : "Control+K"
            }
          />
        </div>
        <label className="accounts-filter">
          <span>Provider</span>
          <select
            aria-label="Filter by provider"
            value={providerFilter}
            onChange={(event) =>
              setProviderFilter(event.currentTarget.value as ProviderFilter)
            }
          >
            <option value="all">All providers</option>
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
          </select>
        </label>
        <label className="accounts-filter">
          <span>Status</span>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.currentTarget.value as StatusFilter)
            }
          >
            {(Object.keys(statusFilterLabels) as StatusFilter[]).map(
              (value) => (
                <option key={value} value={value}>
                  {statusFilterLabels[value]}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="accounts-filter">
          <span>Sort</span>
          <select
            aria-label="Sort accounts"
            value={sort}
            onChange={(event) =>
              setSort(event.currentTarget.value as AccountSort)
            }
          >
            {(Object.keys(sortLabels) as AccountSort[]).map((value) => (
              <option key={value} value={value}>
                {sortLabels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="accounts-count" role="status">
        Showing {visible.length} of {accounts.length}{" "}
        {accounts.length === 1 ? "account" : "accounts"}
        {pinnedIds.size > 0 && ` · ${pinnedIds.size} pinned`}
      </p>

      {visible.length === 0 ? (
        <div className="accounts-empty">
          <p>No accounts match your search or filters.</p>
        </div>
      ) : (
        <div className="accounts-manage-list">
          {visible.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onRemove={onRemove}
              onRename={onRename}
              onVerifyUsage={onVerifyUsage}
              onAction={onAction}
              pinned={pinnedIds.has(account.id)}
              onTogglePin={onTogglePin}
              ambiguous={ambiguousLabelKeys.has(
                `${account.provider}:${account.displayName.trim().toLocaleLowerCase()}`,
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [showCliSettings, setShowCliSettings] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AccountSnapshot | null>(
    null,
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  const [activeView, setActiveView] = useState<"overview" | "accounts">(
    "overview",
  );
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() =>
    loadPinnedIds(),
  );
  const [recentIds, setRecentIds] = useState<string[]>(() => loadRecentIds());

  const showToast = useCallback(
    (message: string, options: Partial<Omit<ToastState, "message">> = {}) => {
      // A new action always replaces the previous notification.
      setToast({
        message,
        tone: options.tone ?? "info",
        action: options.action,
      });
    },
    [],
  );

  const loadDashboard = useCallback(async (force = false) => {
    setIsRefreshing(true);
    setError(null);
    try {
      const bridge = window.quotaMonitor;
      const next = bridge
        ? await (force ? bridge.refresh() : bridge.getDashboard())
        : demoDashboard;
      setDashboard(next);
    } catch {
      setError("Local account data could not be refreshed.");
      setDashboard(demoDashboard);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleProfileAction = useCallback(
    async (account: AccountSnapshot) => {
      const bridge = window.quotaMonitor;
      if (!bridge) {
        showToast("Launch actions are available in the desktop app.");
        return;
      }
      try {
        const isSetup = accountNeedsSetup(account);
        const result = isSetup
          ? await bridge.beginLogin(account.id)
          : await bridge.launchProfile(account.id);
        // Only a real launch counts as "recently used" — a setup handoff does
        // not, so the recent list reflects working sessions.
        if (!isSetup && result.ok) {
          setRecentIds(recordRecent(account.id));
        }
        // Offer a direct fix whenever the provider CLI is the likely blocker —
        // an explicit provider-error, or a probe that reports the CLI as not
        // callable/compatible. A missing CLI can leave a profile in
        // pending-login (not provider-error), so keying only off the lifecycle
        // left "Set up this account" failing in a loop with no escape hatch.
        const cli = dashboard?.cliStatus[account.provider];
        const cliUnready = cli ? !cli.callable || !cli.compatible : false;
        showToast(`${account.displayName}: ${result.message}`, {
          tone: result.ok ? "info" : "error",
          action:
            !result.ok && (account.lifecycle === "provider-error" || cliUnready)
              ? {
                  label: "Open CLI settings",
                  run: () => setShowCliSettings(true),
                }
              : undefined,
        });
      } catch {
        showToast(
          `${account.displayName}: the provider session could not be opened.`,
          { tone: "error" },
        );
      }
    },
    [dashboard, showToast],
  );

  const handleRemoveProfile = useCallback(
    async (account: AccountSnapshot) => {
      const bridge = window.quotaMonitor;
      if (!bridge) {
        showToast("Profile removal is available in the desktop app.");
        return;
      }
      try {
        const result = await bridge.removeProfile(account.id);
        showToast(result.message, { tone: result.ok ? "info" : "error" });
        if (result.ok) await loadDashboard(true);
      } catch {
        showToast(
          `${account.displayName}: the account profile could not be removed.`,
          { tone: "error" },
        );
      }
    },
    [loadDashboard, showToast],
  );

  const handleRenameProfile = useCallback((account: AccountSnapshot) => {
    setRenameTarget(account);
  }, []);

  const handleTogglePin = useCallback((account: AccountSnapshot) => {
    setPinnedIds(togglePinned(account.id));
  }, []);

  const handleEvidence = useCallback(async () => {
    const bridge = window.quotaMonitor;
    if (!bridge) {
      showToast(
        "The cited research is available in docs/research in the desktop project.",
      );
      return;
    }
    try {
      const result = await bridge.openEvidence();
      showToast(result.message, { tone: result.ok ? "info" : "error" });
    } catch {
      showToast("The provider research could not be opened.", {
        tone: "error",
      });
    }
  }, [showToast]);

  const handleProviderUsage = useCallback(
    async (provider: ProviderId) => {
      const bridge = window.quotaMonitor;
      const providerLabel = providerMeta[provider].label;
      if (!bridge) {
        showToast(
          provider === "claude"
            ? "In Claude Code, run /usage to verify current plan limits."
            : "In Codex, open Settings → Usage to verify current plan limits.",
        );
        return;
      }
      try {
        const result = await bridge.openProviderUsage(provider);
        showToast(`${providerLabel}: ${result.message}`, {
          tone: result.ok ? "info" : "error",
        });
      } catch {
        showToast(`${providerLabel}: usage help could not be opened.`, {
          tone: "error",
        });
      }
    },
    [showToast],
  );

  // Auto-update: when the desktop bridge reports a downloaded release, offer a
  // one-click restart. Feature-detected, so the browser preview (no bridge) and
  // tests (bridge mocks omit the method) simply skip it.
  useEffect(() => {
    const bridge = window.quotaMonitor;
    if (!bridge?.onUpdateDownloaded) return;
    return bridge.onUpdateDownloaded((info) => {
      showToast(`QuotaDeck ${info.version} is ready to install.`, {
        action: {
          label: "Restart to install",
          run: () => bridge.installUpdate?.(),
        },
      });
    });
  }, [showToast]);

  useEffect(() => {
    void loadDashboard();
    let timer: number | null = null;
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      const interval = 55_000 + Math.floor(Math.random() * 15_000);
      timer = window.setTimeout(async () => {
        await loadDashboard(true);
        schedule();
      }, interval);
    };
    const handleFocus = () => void loadDashboard(true);
    schedule();
    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadDashboard]);

  const summary = useMemo(() => {
    const accounts = dashboard?.accounts ?? [];
    const ready = accounts.filter(
      (account) => account.state === "ready",
    ).length;
    const windows = accounts.flatMap((account) => account.quotaWindows);
    return { ready, total: accounts.length, reportedWindows: windows.length };
  }, [dashboard]);

  const recommendations = useMemo(
    () =>
      (["claude", "codex"] as const).map((provider) => ({
        provider,
        account: recommendedAccountForProvider(
          dashboard?.accounts ?? [],
          provider,
        ),
      })),
    [dashboard],
  );

  // Labels that collide within a provider (including legacy duplicate data) so
  // their cards can show a disambiguator instead of looking identical.
  const ambiguousLabelKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const account of dashboard?.accounts ?? []) {
      const key = `${account.provider}:${account.displayName.trim().toLocaleLowerCase()}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      [...counts].filter(([, count]) => count > 1).map(([key]) => key),
    );
  }, [dashboard]);

  if (!dashboard) {
    return (
      <div className="loading-screen">
        <span className="brand-mark">Q</span>
        <p>Reading local quota signals…</p>
      </div>
    );
  }

  const isDialogOpen =
    showAddProfile || showCliSettings || renameTarget !== null;

  return (
    <div className={`app-shell platform-${dashboard.platform.id}`}>
      <aside
        className="sidebar"
        aria-hidden={isDialogOpen ? true : undefined}
        inert={isDialogOpen}
      >
        <div className="brand-lockup">
          <span className="brand-mark">Q</span>
          <div>
            <strong>QuotaDeck</strong>
            <small>AI account console</small>
          </div>
        </div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${activeView === "overview" ? "active" : ""}`}
            aria-current={activeView === "overview" ? "page" : undefined}
            onClick={() => setActiveView("overview")}
          >
            <LayoutDashboard size={18} /> Overview
          </button>
          <button
            className={`nav-item ${activeView === "accounts" ? "active" : ""}`}
            aria-current={activeView === "accounts" ? "page" : undefined}
            onClick={() => setActiveView("accounts")}
          >
            <Users size={18} /> Accounts{" "}
            <span>{dashboard.accounts.length}</span>
          </button>
          <button className="nav-item" disabled>
            <Activity size={18} /> History <small>Soon</small>
          </button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="privacy-card">
          <ShieldCheck size={18} />
          <div>
            <strong>Local by design</strong>
            <p>Credentials never leave this device.</p>
          </div>
        </div>
        <nav aria-label="Secondary navigation">
          <button className="nav-item" onClick={() => setShowCliSettings(true)}>
            <Settings size={18} /> Settings
          </button>
          <button className="nav-item" disabled>
            <CircleHelp size={18} /> Help <small>Soon</small>
          </button>
        </nav>
        <div className="profile-chip">
          <span>QD</span>
          <div>
            <strong>Local workspace</strong>
            <small>{dashboard.platform.label}</small>
          </div>
        </div>
      </aside>

      <main
        className="main-content"
        aria-hidden={isDialogOpen ? true : undefined}
        inert={isDialogOpen}
      >
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <i>/</i>
            <strong>
              {activeView === "accounts" ? "Accounts" : "Overview"}
            </strong>
          </div>
          <div className="topbar-actions">
            {dashboard.mode === "demo" && (
              <span className="demo-badge">Preview data</span>
            )}
            <button
              className="refresh-button"
              onClick={() => void loadDashboard(true)}
              disabled={isRefreshing}
            >
              <RefreshCw size={16} className={isRefreshing ? "spinning" : ""} />
              {isRefreshing ? "Refreshing" : "Refresh"}
            </button>
            <button
              className="add-profile-button"
              onClick={() => setShowAddProfile(true)}
            >
              <Plus size={16} /> Add account
            </button>
          </div>
        </header>

        <div className="content-wrap">
          {activeView === "overview" ? (
            <>
              <section className="hero-row">
                <div>
                  <span className="eyebrow hero-eyebrow">
                    <Sparkles size={14} /> Live workspace
                  </span>
                  <h1>
                    Your AI runway,
                    <br />
                    <em>at a glance.</em>
                  </h1>
                  <p>
                    Know what is available, what resets next, and which account
                    is ready for work.
                  </p>
                </div>
                <div className="summary-card">
                  <div className="summary-block">
                    <span className="summary-figure">
                      {summary.ready}
                      <i>/{summary.total}</i>
                    </span>
                    <span className="summary-label">accounts ready</span>
                    <div className="readiness-track" aria-hidden="true">
                      {dashboard.accounts.map((account) => (
                        <span
                          key={account.id}
                          className={`readiness-seg ${
                            account.state === "ready" ? "on" : ""
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="summary-divider" />
                  <div className="summary-block compact">
                    <span className="summary-figure sm">
                      {summary.reportedWindows}
                    </span>
                    <span className="summary-label">reported windows</span>
                  </div>
                </div>
              </section>

              {error && (
                <div className="error-banner" role="alert">
                  {error} Showing safe preview data.
                </div>
              )}

              <section className="workspace-grid">
                <div className="accounts-section">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Connected accounts</span>
                      <h2>Quota overview</h2>
                    </div>
                    <span className="last-updated">
                      Updated {relativeTime(dashboard.observedAt)}
                    </span>
                  </div>
                  <div className="account-grid">
                    {dashboard.accounts.map((account) => (
                      <AccountCard
                        key={account.id}
                        account={account}
                        onRemove={handleRemoveProfile}
                        onRename={handleRenameProfile}
                        onVerifyUsage={handleProviderUsage}
                        pinned={pinnedIds.has(account.id)}
                        onTogglePin={handleTogglePin}
                        ambiguous={ambiguousLabelKeys.has(
                          `${account.provider}:${account.displayName.trim().toLocaleLowerCase()}`,
                        )}
                      />
                    ))}
                  </div>
                  <div className="insight-strip">
                    <span className="insight-icon">
                      <Sparkles size={17} />
                    </span>
                    <div>
                      <strong>Best verified runway by provider</strong>
                      <div className="provider-recommendations">
                        {recommendations.map(({ provider, account }) => (
                          <p key={provider}>
                            <b>{providerMeta[provider].label}:</b>{" "}
                            {account && availablePercent(account) !== null
                              ? `${account.displayName} has ${Math.round(availablePercent(account)!)}% available in its tightest fresh window.`
                              : "No fresh subscription quota is available."}
                          </p>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => void handleEvidence()}>
                      View evidence <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
                <SmartSwitcher
                  accounts={dashboard.accounts}
                  onAction={handleProfileAction}
                  shortcutModifier={dashboard.platform.shortcutModifier}
                  pinnedIds={pinnedIds}
                />
              </section>
            </>
          ) : (
            <>
              <section className="section-heading accounts-heading">
                <div>
                  <span className="eyebrow">Manage</span>
                  <h1>Accounts</h1>
                  <p>
                    Search, filter, pin, set up, verify, launch, or safely
                    remove every connected account.
                  </p>
                </div>
                <span className="last-updated">
                  Updated {relativeTime(dashboard.observedAt)}
                </span>
              </section>

              {error && (
                <div className="error-banner" role="alert">
                  {error} Showing safe preview data.
                </div>
              )}

              <AccountsView
                accounts={dashboard.accounts}
                pinnedIds={pinnedIds}
                recentIds={recentIds}
                ambiguousLabelKeys={ambiguousLabelKeys}
                shortcutModifier={dashboard.platform.shortcutModifier}
                onAction={handleProfileAction}
                onRemove={handleRemoveProfile}
                onRename={handleRenameProfile}
                onVerifyUsage={handleProviderUsage}
                onTogglePin={handleTogglePin}
              />
            </>
          )}
        </div>
      </main>
      {showAddProfile && (
        <AddProfileDialog
          onClose={() => setShowAddProfile(false)}
          onAdded={setDashboard}
          capabilities={dashboard.capabilities}
        />
      )}
      {showCliSettings && (
        <CliSettingsDialog
          dashboard={dashboard}
          onClose={() => setShowCliSettings(false)}
          onChanged={() => loadDashboard(true)}
          onAlertThresholdSaved={(threshold) =>
            setDashboard((current) =>
              current
                ? { ...current, alertThresholdPercent: threshold }
                : current,
            )
          }
        />
      )}
      {renameTarget && (
        <RenameProfileDialog
          account={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRenamed={(message) => {
            showToast(message);
            void loadDashboard(true);
          }}
        />
      )}
      <ToastRegion toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
