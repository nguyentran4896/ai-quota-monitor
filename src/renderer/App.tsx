import {
  Activity,
  ArrowRight,
  Check,
  CircleHelp,
  Gauge,
  LayoutDashboard,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
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
import { demoDashboard } from "./demo-data";

const providerMeta: Record<
  ProviderId,
  { mark: string; label: string; accent: string }
> = {
  claude: { mark: "A", label: "Claude", accent: "coral" },
  codex: { mark: "O", label: "Codex", accent: "mint" },
};

function titleCase(value: string | null): string {
  if (!value) return "Plan unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function QuotaMeter({ window }: { window: QuotaWindow }) {
  const available = Math.max(0, Math.round(100 - window.usedPercent));
  return (
    <div className="quota-meter">
      <div className="meter-heading">
        <div>
          <span className="meter-value">{available}%</span>
          <span className="meter-caption"> available</span>
        </div>
        <span className="meter-window">{window.label}</span>
      </div>
      <div
        className="meter-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={available}
        aria-label={`${available}% available`}
      >
        <span style={{ width: `${available}%` }} />
      </div>
      <div className="meter-footer">
        <span>{Math.round(window.usedPercent)}% used</span>
        <span>{resetLabel(window.resetsAt)}</span>
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
}: {
  account: AccountSnapshot;
  onRemove: (account: AccountSnapshot) => Promise<void>;
  onRename: (account: AccountSnapshot) => void;
  onVerifyUsage: (provider: ProviderId) => Promise<void>;
  ambiguous?: boolean;
}) {
  const meta = providerMeta[account.provider];

  return (
    <article
      className={`account-card accent-${meta.accent}`}
      aria-label={`${account.displayName} account`}
    >
      <div className="account-card-top">
        <div className="provider-identity">
          <span className="provider-mark">{meta.mark}</span>
          <div className="provider-identity-text">
            <div className="eyebrow">{meta.label}</div>
            <h3>{account.displayName}</h3>
            {ambiguous && (
              <span className="account-disambiguator">
                {account.identity ?? `#${account.id.slice(0, 8)}`}
              </span>
            )}
          </div>
        </div>
        <div className="account-card-actions">
          <span className="provider-live-dot" title="Local profile" />
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

      <div className="account-meta-row">
        <span className={`status-pill status-${account.quotaStatus}`}>
          <i />{" "}
          {account.state === "limited"
            ? "Limited"
            : quotaStatusLabels[account.quotaStatus]}
        </span>
        <span className="plan-pill">{titleCase(account.plan)}</span>
      </div>

      <div className="account-safety-row">
        <span>
          <strong>Identity</strong> {account.identity ?? "Not reported"}
          {account.isManaged && (
            <small
              className={account.identityVerified ? "verified" : "pending"}
            >
              {account.identityVerified ? " Verified" : " Verify before launch"}
            </small>
          )}
        </span>
        <span className="account-mode-pills">
          <span className="auth-pill">{authModeLabels[account.authMode]}</span>
          <span className={`billing-pill billing-${account.billingMode}`}>
            {billingModeLabels[account.billingMode]}
          </span>
        </span>
      </div>
      <div className="profile-scope">
        Workspace: {account.isManaged ? "Isolated profile" : "Current CLI home"}
      </div>

      {account.quotaWindows.length ? (
        <div className="quota-stack">
          {account.quotaWindows.map((window) => (
            <QuotaMeter key={window.id} window={window} />
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
        <span>
          <ShieldCheck size={14} /> {account.source.label}
          <small>· {relativeTime(account.source.observedAt)}</small>
        </span>
        <button
          type="button"
          className="usage-help-button"
          onClick={() => void onVerifyUsage(account.provider)}
          aria-label={`Open official ${meta.label} usage instructions`}
        >
          {account.provider === "claude"
            ? "Verify with /usage"
            : "Verify in Settings → Usage"}
        </button>
      </div>
    </article>
  );
}

function SmartSwitcher({
  accounts,
  onAction,
  actionMessage,
  shortcutModifier,
}: {
  accounts: AccountSnapshot[];
  onAction: (account: AccountSnapshot) => Promise<void>;
  actionMessage: string | null;
  shortcutModifier: "Ctrl" | "⌘";
}) {
  const [selected, setSelected] = useState(accounts[0]?.id ?? "");
  const [isLaunching, setIsLaunching] = useState(false);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedAccount = accounts.find((account) => account.id === selected);
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
        <span className="shortcut">{shortcutModifier} K</span>
      </div>
      <p className="panel-intro">
        Choose an account, verify its identity and billing mode, then launch a
        separate session.
      </p>

      <div className="switcher-list" role="listbox" aria-label="AI accounts">
        {accounts.map((account, index) => {
          const meta = providerMeta[account.provider];
          const remaining = availablePercent(account);
          const available =
            remaining === null
              ? "Quota hidden"
              : `${Math.round(remaining)}% free`;
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
                  nextIndex = (index + 1) % accounts.length;
                if (event.key === "ArrowUp")
                  nextIndex = (index - 1 + accounts.length) % accounts.length;
                if (event.key === "Home") nextIndex = 0;
                if (event.key === "End") nextIndex = accounts.length - 1;
                if (nextIndex === null) return;
                event.preventDefault();
                const nextAccount = accounts[nextIndex];
                if (nextAccount) setSelected(nextAccount.id);
                optionRefs.current[nextIndex]?.focus();
              }}
              role="option"
              aria-selected={isSelected}
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
      {actionMessage && (
        <p className="action-message" role="status">
          {actionMessage}
        </p>
      )}
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
        caught instanceof Error
          ? caught.message
          : "Account profile could not be created.",
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
            return (
              <article className="cli-status-card" key={provider}>
                <div>
                  <strong>{name}</strong>
                  <span
                    className={
                      status.callable && status.compatible
                        ? "cli-ready"
                        : "cli-missing"
                    }
                  >
                    {status.callable && status.compatible
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

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [showCliSettings, setShowCliSettings] = useState(false);
  const [renameTarget, setRenameTarget] = useState<AccountSnapshot | null>(
    null,
  );
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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

  const handleProfileAction = useCallback(async (account: AccountSnapshot) => {
    const bridge = window.quotaMonitor;
    if (!bridge) {
      setActionMessage("Launch actions are available in the desktop app.");
      return;
    }
    try {
      const result = accountNeedsSetup(account)
        ? await bridge.beginLogin(account.id)
        : await bridge.launchProfile(account.id);
      setActionMessage(result.message);
    } catch {
      setActionMessage("The provider session could not be opened. Try again.");
    }
  }, []);

  const handleRemoveProfile = useCallback(
    async (account: AccountSnapshot) => {
      const bridge = window.quotaMonitor;
      if (!bridge) {
        setActionMessage("Profile removal is available in the desktop app.");
        return;
      }
      try {
        const result = await bridge.removeProfile(account.id);
        setActionMessage(result.message);
        if (result.ok) await loadDashboard(true);
      } catch {
        setActionMessage(
          "The account profile could not be removed. Try again.",
        );
      }
    },
    [loadDashboard],
  );

  const handleRenameProfile = useCallback((account: AccountSnapshot) => {
    setRenameTarget(account);
  }, []);

  const handleEvidence = useCallback(async () => {
    const bridge = window.quotaMonitor;
    if (!bridge) {
      setActionMessage(
        "The cited research is available in docs/research in the desktop project.",
      );
      return;
    }
    try {
      const result = await bridge.openEvidence();
      setActionMessage(result.message);
    } catch {
      setActionMessage("The provider research could not be opened.");
    }
  }, []);

  const handleProviderUsage = useCallback(async (provider: ProviderId) => {
    const bridge = window.quotaMonitor;
    if (!bridge) {
      setActionMessage(
        provider === "claude"
          ? "In Claude Code, run /usage to verify current plan limits."
          : "In Codex, open Settings → Usage to verify current plan limits.",
      );
      return;
    }
    try {
      const result = await bridge.openProviderUsage(provider);
      setActionMessage(result.message);
    } catch {
      setActionMessage("The official provider usage help could not be opened.");
    }
  }, []);

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
          <button className="nav-item active">
            <LayoutDashboard size={18} /> Overview
          </button>
          <button className="nav-item" onClick={() => setShowAddProfile(true)}>
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
            <strong>Overview</strong>
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
                Know what is available, what resets next, and which account is
                ready for work.
              </p>
            </div>
            <div className="summary-card">
              <div className="summary-icon">
                <Gauge size={22} />
              </div>
              <div className="summary-stat">
                <strong>
                  {summary.ready}/{summary.total}
                </strong>
                <span>accounts ready</span>
              </div>
              <div className="summary-divider" />
              <div className="summary-stat compact">
                <strong>{summary.reportedWindows}</strong>
                <span>reported windows</span>
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
              actionMessage={actionMessage}
              shortcutModifier={dashboard.platform.shortcutModifier}
            />
          </section>
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
            setActionMessage(message);
            void loadDashboard(true);
          }}
        />
      )}
    </div>
  );
}
