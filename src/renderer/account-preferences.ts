// Purely local, non-sensitive view preferences for the Accounts destination:
// which accounts are pinned and which were most recently launched. These are UI
// affordances only — never credentials, tokens, or identities — so the renderer
// persists them in localStorage rather than adding main-process storage and IPC.
// Every access is guarded: if storage is unavailable (or throws in a hardened
// context) the app degrades to an empty, in-memory view instead of crashing.

const PINNED_KEY = "quotadeck.pinnedAccounts";
const RECENT_KEY = "quotadeck.recentAccounts";
const RECENT_LIMIT = 8;

function readList(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return [];
  }
}

function writeList(key: string, values: string[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Storage may be full or blocked; the in-memory state the caller already
    // holds stays correct for this session.
  }
}

export function loadPinnedIds(): Set<string> {
  return new Set(readList(PINNED_KEY));
}

export function togglePinned(id: string): Set<string> {
  const pinned = loadPinnedIds();
  if (pinned.has(id)) {
    pinned.delete(id);
  } else {
    pinned.add(id);
  }
  writeList(PINNED_KEY, [...pinned]);
  return pinned;
}

export function loadRecentIds(): string[] {
  return readList(RECENT_KEY);
}

// Records a launch, most-recent-first, de-duplicated and capped so the list
// stays bounded no matter how many accounts a workspace accumulates.
export function recordRecent(id: string): string[] {
  const next = [id, ...loadRecentIds().filter((value) => value !== id)].slice(
    0,
    RECENT_LIMIT,
  );
  writeList(RECENT_KEY, next);
  return next;
}
