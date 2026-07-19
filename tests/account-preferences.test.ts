import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadPinnedIds,
  loadRecentIds,
  recordRecent,
  togglePinned,
} from "../src/renderer/account-preferences";

describe("account-preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("toggles a pin on and off and persists it", () => {
    expect(loadPinnedIds().has("codex-a")).toBe(false);
    const afterPin = togglePinned("codex-a");
    expect(afterPin.has("codex-a")).toBe(true);
    expect(loadPinnedIds().has("codex-a")).toBe(true);

    const afterUnpin = togglePinned("codex-a");
    expect(afterUnpin.has("codex-a")).toBe(false);
    expect(loadPinnedIds().has("codex-a")).toBe(false);
  });

  it("records recents most-recent-first, de-duplicated and bounded to eight", () => {
    for (let index = 0; index < 10; index += 1) {
      recordRecent(`account-${index}`);
    }
    // Re-launching an older account moves it to the front without duplicating.
    recordRecent("account-3");
    const recents = loadRecentIds();
    expect(recents).toHaveLength(8);
    expect(recents[0]).toBe("account-3");
    expect(new Set(recents).size).toBe(recents.length);
  });

  it("degrades to empty state when stored data is corrupt", () => {
    window.localStorage.setItem("quotadeck.pinnedAccounts", "{not json");
    window.localStorage.setItem("quotadeck.recentAccounts", '"not an array"');
    expect(loadPinnedIds().size).toBe(0);
    expect(loadRecentIds()).toEqual([]);
  });
});
