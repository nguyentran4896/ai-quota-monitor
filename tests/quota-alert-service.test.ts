import { describe, expect, it, vi } from "vitest";
import { QuotaAlertService } from "../src/main/services/quota-alert-service";
import type { AccountSnapshot } from "../src/shared/contracts";

const freshSubscription: AccountSnapshot = {
  id: "codex-work",
  provider: "codex",
  displayName: "Codex — Work",
  identity: "w***@example.com",
  identityVerified: true,
  plan: "Pro",
  authMode: "subscription",
  billingMode: "subscription",
  quotaStatus: "fresh",
  state: "limited",
  lifecycle: "verified",
  providerError: null,
  isActive: true,
  isManaged: true,
  quotaWindows: [
    {
      id: "weekly",
      label: "Weekly window",
      usedPercent: 86.4,
      windowMinutes: 10_080,
      resetsAt: "2026-07-25T00:00:00.000Z",
    },
  ],
  source: {
    label: "Codex app-server",
    confidence: "provider-reported",
    observedAt: "2026-07-18T00:00:00.000Z",
  },
  notice: null,
};

describe("QuotaAlertService", () => {
  it("alerts once for a fresh provider-reported subscription window", () => {
    const notify = vi.fn();
    const service = new QuotaAlertService(notify);

    service.evaluate([freshSubscription], 85);
    service.evaluate([freshSubscription], 85);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      title: "Codex — Work quota alert",
      body: "Weekly window is 86% used. Verify this in Codex before switching accounts.",
    });
  });

  it("does not alert for stale, API-billed, locally inferred, or disabled data", () => {
    const notify = vi.fn();
    const service = new QuotaAlertService(notify);

    service.evaluate([{ ...freshSubscription, quotaStatus: "stale" }], 85);
    service.evaluate([{ ...freshSubscription, billingMode: "api" }], 85);
    service.evaluate(
      [
        {
          ...freshSubscription,
          source: {
            ...freshSubscription.source,
            confidence: "local-observation",
          },
        },
      ],
      85,
    );
    service.evaluate([freshSubscription], null);

    expect(notify).not.toHaveBeenCalled();
  });

  it("alerts again after the provider reports a new reset window", () => {
    const notify = vi.fn();
    const service = new QuotaAlertService(notify);

    service.evaluate([freshSubscription], 85);
    service.evaluate(
      [
        {
          ...freshSubscription,
          quotaWindows: [
            {
              ...freshSubscription.quotaWindows[0]!,
              resetsAt: "2026-08-01T00:00:00.000Z",
            },
          ],
        },
      ],
      85,
    );

    expect(notify).toHaveBeenCalledTimes(2);
  });
});
