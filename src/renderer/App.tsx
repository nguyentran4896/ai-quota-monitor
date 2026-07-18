import {
  Activity,
  ArrowRight,
  Check,
  CircleHelp,
  Gauge,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AccountSnapshot, DashboardSnapshot, ProviderId, QuotaWindow } from "../shared/contracts";
import { demoDashboard } from "./demo-data";

const providerMeta: Record<ProviderId, { mark: string; label: string; accent: string }> = {
  claude: { mark: "A", label: "Claude", accent: "coral" },
  codex: { mark: "O", label: "Codex", accent: "mint" },
};

function titleCase(value: string | null): string {
  if (!value) return "Plan unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1_000));
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
  if (delta <= 0) return "Reset pending";
  const hours = Math.floor(delta / 3_600_000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `Resets in ${days}d ${hours % 24}h`;
  return `Resets in ${hours}h`;
}

function availablePercent(account: AccountSnapshot): number | null {
  if (!account.quotaWindows.length) return null;
  return Math.min(...account.quotaWindows.map((window) => Math.max(0, 100 - window.usedPercent)));
}

function recommendedAccount(accounts: AccountSnapshot[]): AccountSnapshot | undefined {
  return [...accounts].sort((left, right) => {
    const leftAvailable = availablePercent(left) ?? (left.state === "ready" ? -1 : -2);
    const rightAvailable = availablePercent(right) ?? (right.state === "ready" ? -1 : -2);
    return rightAvailable - leftAvailable;
  })[0];
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

function AccountCard({ account }: { account: AccountSnapshot }) {
  const meta = providerMeta[account.provider];

  return (
    <article className={`account-card accent-${meta.accent}`}>
      <div className="account-card-top">
        <div className="provider-identity">
          <span className="provider-mark">{meta.mark}</span>
          <div>
            <div className="eyebrow">{meta.label}</div>
            <h3>{account.displayName}</h3>
          </div>
        </div>
        <span className="provider-live-dot" title="Local profile" />
      </div>

      <div className="account-meta-row">
        <span className={`status-pill status-${account.state}`}>
          <i /> {account.state === "ready" ? "Ready" : account.state.replace("-", " ")}
        </span>
        <span className="plan-pill">{titleCase(account.plan)}</span>
      </div>

      {account.quotaWindows.length ? (
        <div className="quota-stack">
          {account.quotaWindows.map((window) => <QuotaMeter key={window.id} window={window} />)}
        </div>
      ) : (
        <div className="unavailable-meter">
          <div className="unavailable-icon">
            <CircleHelp size={19} />
          </div>
          <div>
            <strong>Exact quota unavailable</strong>
            <p>The provider does not expose a supported structured quota feed for this account.</p>
          </div>
        </div>
      )}

      <div className="source-row">
        <span><ShieldCheck size={14} /> {account.source.label}</span>
        <span>{relativeTime(account.source.observedAt)}</span>
      </div>
    </article>
  );
}

function SmartSwitcher({
  accounts,
  onAction,
  actionMessage,
}: {
  accounts: AccountSnapshot[];
  onAction: (account: AccountSnapshot) => Promise<void>;
  actionMessage: string | null;
}) {
  const [selected, setSelected] = useState(recommendedAccount(accounts)?.id ?? "");
  const [isLaunching, setIsLaunching] = useState(false);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const selectedAccount = accounts.find((account) => account.id === selected) ?? accounts[0];
  const needsSetup = selectedAccount?.isManaged && ["unknown", "signed-out"].includes(selectedAccount.state);

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
      if (event.ctrlKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        firstOptionRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <aside className="switcher-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Workspace</span>
          <h2>Smart switcher</h2>
        </div>
        <span className="shortcut">Ctrl K</span>
      </div>
      <p className="panel-intro">Choose the account with the most runway before starting your next session.</p>

      <div className="switcher-list" role="listbox" aria-label="AI accounts">
        {accounts.map((account) => {
          const meta = providerMeta[account.provider];
          const remaining = availablePercent(account);
          const available = remaining === null ? "Quota hidden" : `${Math.round(remaining)}% free`;
          const isSelected = account.id === selectedAccount?.id;
          return (
            <button
              className={`switcher-item ${isSelected ? "selected" : ""}`}
              key={account.id}
              ref={account === accounts[0] ? firstOptionRef : undefined}
              onClick={() => setSelected(account.id)}
              role="option"
              aria-selected={isSelected}
            >
              <span className={`provider-mark small accent-${meta.accent}`}>{meta.mark}</span>
              <span className="switcher-copy">
                <strong>{account.displayName}</strong>
                <small>{titleCase(account.plan)} · {available}</small>
              </span>
              {isSelected && <span className="selected-check"><Check size={13} /></span>}
            </button>
          );
        })}
      </div>

      <button className="primary-action" disabled={!selectedAccount || isLaunching} onClick={() => void handleAction()}>
        {isLaunching ? "Opening…" : needsSetup ? "Set up this account" : `Launch ${selectedAccount ? providerMeta[selectedAccount.provider].label : "account"}`}
        <ArrowRight size={17} />
      </button>
      {actionMessage && <p className="action-message">{actionMessage}</p>}
      <p className="safety-note"><ShieldCheck size={14} /> Launching starts a separate profile process. QuotaDeck never copies raw tokens.</p>
    </aside>
  );
}

function AddProfileDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (dashboard: DashboardSnapshot) => void;
}) {
  const [provider, setProvider] = useState<ProviderId>("claude");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const bridge = window.quotaMonitor;
    if (!bridge) {
      setError("Account creation is available in the desktop app, not browser preview mode.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      onAdded(await bridge.addProfile({ provider, displayName }));
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Account profile could not be created.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="add-profile-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-heading">
          <div><span className="eyebrow">Isolated profile</span><h2 id="add-profile-title">Add an AI account</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p>QuotaDeck creates a separate provider home. You will sign in through the provider's official flow; credentials stay provider-owned.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label>Provider</label>
          <div className="provider-choice">
            {(["claude", "codex"] as const).map((value) => (
              <button type="button" key={value} className={provider === value ? "selected" : ""} onClick={() => setProvider(value)}>
                <span className={`provider-mark small accent-${providerMeta[value].accent}`}>{providerMeta[value].mark}</span>
                {providerMeta[value].label}
                {provider === value && <Check size={14} />}
              </button>
            ))}
          </div>
          <label htmlFor="profile-name">Account label</label>
          <input id="profile-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Claude — Client work" autoFocus maxLength={48} />
          {error && <div className="form-error">{error}</div>}
          <div className="dialog-actions">
            <button type="button" className="secondary-action" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-action" disabled={isSaving || displayName.trim().length < 2}>
              {isSaving ? "Creating…" : "Create profile"} <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddProfile, setShowAddProfile] = useState(false);
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
    const needsSetup = account.isManaged && ["unknown", "signed-out"].includes(account.state);
    const result = needsSetup ? await bridge.beginLogin(account.id) : await bridge.launchProfile(account.id);
    setActionMessage(result.message);
  }, []);

  const handleEvidence = useCallback(async () => {
    const bridge = window.quotaMonitor;
    if (!bridge) {
      setActionMessage("The cited research is available in docs/research in the desktop project.");
      return;
    }
    const result = await bridge.openEvidence();
    setActionMessage(result.message);
  }, []);

  useEffect(() => {
    void loadDashboard();
    const timer = window.setInterval(() => void loadDashboard(true), 60_000);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const summary = useMemo(() => {
    const accounts = dashboard?.accounts ?? [];
    const ready = accounts.filter((account) => account.state === "ready").length;
    const windows = accounts.flatMap((account) => account.quotaWindows);
    return { ready, total: accounts.length, reportedWindows: windows.length };
  }, [dashboard]);

  const recommendation = useMemo(
    () => recommendedAccount(dashboard?.accounts ?? []),
    [dashboard],
  );

  if (!dashboard) {
    return <div className="loading-screen"><span className="brand-mark">Q</span><p>Reading local quota signals…</p></div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-mark">Q</span>
          <div><strong>QuotaDeck</strong><small>AI account console</small></div>
        </div>
        <nav aria-label="Main navigation">
          <button className="nav-item active"><LayoutDashboard size={18} /> Overview</button>
          <button className="nav-item" onClick={() => setShowAddProfile(true)}><Users size={18} /> Accounts <span>{dashboard.accounts.length}</span></button>
          <button className="nav-item" disabled><Activity size={18} /> History <small>Soon</small></button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="privacy-card">
          <ShieldCheck size={18} />
          <div><strong>Local by design</strong><p>Credentials never leave this device.</p></div>
        </div>
        <nav aria-label="Secondary navigation">
          <button className="nav-item" disabled><Settings size={18} /> Settings <small>Soon</small></button>
          <button className="nav-item" disabled><CircleHelp size={18} /> Help <small>Soon</small></button>
        </nav>
        <div className="profile-chip"><span>NT</span><div><strong>Local workspace</strong><small>Windows</small></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><i>/</i><strong>Overview</strong></div>
          <div className="topbar-actions">
            {dashboard.mode === "demo" && <span className="demo-badge">Preview data</span>}
            <button className="refresh-button" onClick={() => void loadDashboard(true)} disabled={isRefreshing}>
              <RefreshCw size={16} className={isRefreshing ? "spinning" : ""} />
              {isRefreshing ? "Refreshing" : "Refresh"}
            </button>
            <button className="add-profile-button" onClick={() => setShowAddProfile(true)}><Plus size={16} /> Add account</button>
          </div>
        </header>

        <div className="content-wrap">
          <section className="hero-row">
            <div>
              <span className="eyebrow hero-eyebrow"><Sparkles size={14} /> Live workspace</span>
              <h1>Your AI runway,<br /><em>at a glance.</em></h1>
              <p>Know what is available, what resets next, and which account is ready for work.</p>
            </div>
            <div className="summary-card">
              <div className="summary-icon"><Gauge size={22} /></div>
              <div className="summary-stat"><strong>{summary.ready}/{summary.total}</strong><span>accounts ready</span></div>
              <div className="summary-divider" />
              <div className="summary-stat compact"><strong>{summary.reportedWindows}</strong><span>reported windows</span></div>
            </div>
          </section>

          {error && <div className="error-banner">{error} Showing safe preview data.</div>}

          <section className="workspace-grid">
            <div className="accounts-section">
              <div className="section-heading">
                <div><span className="eyebrow">Connected accounts</span><h2>Quota overview</h2></div>
                <span className="last-updated">Updated {relativeTime(dashboard.observedAt)}</span>
              </div>
              <div className="account-grid">
                {dashboard.accounts.map((account) => <AccountCard key={account.id} account={account} />)}
              </div>
              <div className="insight-strip">
                <span className="insight-icon"><Sparkles size={17} /></span>
                <div>
                  <strong>Best verified runway</strong>
                  <p>
                    {recommendation && availablePercent(recommendation) !== null
                      ? `${recommendation.displayName} has ${Math.round(availablePercent(recommendation)!)}% available in its current reported window.`
                      : "No provider-reported quota window is available yet. Use the account freshness labels before choosing."}
                  </p>
                </div>
                <button onClick={() => void handleEvidence()}>View evidence <ArrowRight size={15} /></button>
              </div>
            </div>
            <SmartSwitcher accounts={dashboard.accounts} onAction={handleProfileAction} actionMessage={actionMessage} />
          </section>
        </div>
      </main>
      {showAddProfile && <AddProfileDialog onClose={() => setShowAddProfile(false)} onAdded={setDashboard} />}
    </div>
  );
}
