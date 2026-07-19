import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// jsdom does not apply media queries or layout, so these guard the responsive
// CSS contract statically. A full visual pass still belongs in an Electron
// smoke test, but this prevents the specific regression from returning.
const css = readFileSync(
  path.join(process.cwd(), "src/renderer/styles.css"),
  "utf8",
);

describe("responsive layout contract", () => {
  it("never hides the switcher or sidebar with display:none", () => {
    // Core controls (launch/setup action, status message, navigation) must stay
    // reachable at every supported window width — no display:none without an
    // equivalent accessible control.
    const hidden = /\.(switcher-panel|sidebar)\s*\{[^}]*display:\s*none/gis;
    expect(css).not.toMatch(hidden);
  });

  it("lets a long account label ellipsize without shoving the card actions", () => {
    // Item 4: min-width:0 on the identity text wrapper plus non-shrinking
    // actions keep a 48-char label from overlapping the dot/rename/remove.
    expect(css).toMatch(/\.provider-identity-text\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.account-card-actions\s*\{[^}]*flex:\s*0 0 auto/);
    expect(css).toMatch(/\.account-meta-row\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/\.account-safety-row\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it("drops the unreachable breakpoint below the 1040px window minimum", () => {
    // Electron's BrowserWindow minWidth is 1040px, so any max-width breakpoint
    // under it is dead code that must be reconciled away.
    expect(css).not.toMatch(/max-width:\s*(8\d\d|9\d\d|10[0-3]\d)px/);
  });
});
