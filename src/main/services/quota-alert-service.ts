import type { AccountSnapshot, AlertThreshold } from "../../shared/contracts";

export interface QuotaAlertMessage {
  title: string;
  body: string;
}

const MAX_RECORDED_ALERTS = 512;

export class QuotaAlertService {
  private readonly recorded = new Set<string>();

  constructor(private readonly notify: (message: QuotaAlertMessage) => void) {}

  evaluate(accounts: AccountSnapshot[], threshold: AlertThreshold): void {
    if (threshold === null) return;

    for (const account of accounts) {
      if (
        account.quotaStatus !== "fresh" ||
        account.billingMode !== "subscription" ||
        account.source.confidence !== "provider-reported"
      ) {
        continue;
      }

      for (const window of account.quotaWindows) {
        if (window.usedPercent < threshold) continue;
        const key = [
          account.id,
          window.id,
          window.resetsAt ?? "unknown-reset",
          threshold,
        ].join("|");
        if (this.recorded.has(key)) continue;

        this.recorded.add(key);
        this.trimRecordedAlerts();
        const providerName = account.provider === "claude" ? "Claude" : "Codex";
        this.notify({
          title: `${account.displayName} quota alert`,
          body: `${window.label} is ${Math.round(window.usedPercent)}% used. Verify this in ${providerName} before switching accounts.`,
        });
      }
    }
  }

  private trimRecordedAlerts(): void {
    while (this.recorded.size > MAX_RECORDED_ALERTS) {
      const oldest = this.recorded.values().next().value as string | undefined;
      if (!oldest) return;
      this.recorded.delete(oldest);
    }
  }
}
