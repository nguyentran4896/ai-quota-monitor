# QuotaDeck UI transformation — provider identity + health scale

Date: 2026-07-19
Status: implemented (branch `codex/native-windows-development`)

## Problem

Providers were distinguished only by two nearly-identical grey squares (`#edeae6`
warm vs `#e6ebe9` cool) with a single letter (`A`/`O`). Nothing read "Claude" vs
"Codex" at a glance. Separately, green did triple duty — primary action, meter
fill, and an implied "healthy" — so colour carried no consistent meaning.

## Decision: two orthogonal colour axes

Colour is split into two jobs that never appear on the same element:

- **AXIS 1 — WHO (provider identity): hue + shape.**
  - Claude = warm coral `#d97757` + an original radial **spark** glyph.
  - Codex = ink `#1a1a1a` + an original hex **blossom** glyph.
  - Hue appears only on: the glyph (`currentColor`) and a 2px card top-edge.
    Text uses AA-safe variants (`--provider-claude-ink #b45033`; Codex text is
    already `#1a1a1a`).
- **AXIS 2 — HEALTH (quota runway): a sequential fill scale.**
  - safe `#17835a` → low `#b0761a` → critical `#c0453b`.
  - Appears only on: the radial ring fill, the linear readiness meter, and the
    status dot. `*-ink` variants (`#157c55` / `#956210` / `#c0453b`) are the
    AA-safe text values; `*-soft` are the dot halos.

The app's single green `--accent` stays the "go / primary action" signal (Launch
button, active nav, focus, selected chip). Green = go/safe, so it no longer
collides with provider identity.

## Glyphs

Original geometric marks drawn with `currentColor`, **not** the trademarked
Anthropic/OpenAI logos — safe to ship in a public OSS repo. Rendered as an
`aria-hidden` inline `<svg>` (the account name and aria-labels already announce
the provider). The two silhouettes differ topologically (filled radial spark vs
stroked interlaced hexagon), so identity survives with hue stripped
(forced-colors / colourblind).

## Accessibility

Every text colour clears WCAG AA 4.5:1 on both the `#f4f5f6` canvas and white.
Coral `#d97757` fails AA text and even the 3:1 graphic bar on the grey canvas, so
it is used only as a glyph on a **white tile** and as the card top-edge on the
white card — never as text, never on the canvas. Runway is conveyed redundantly
(ring arc length + monochrome tabular `%` + status text), not by colour alone.
`@media (forced-colors: active)` maps the health fills to system colours and the
provider top-edge to `CanvasText`.

## Token-migration safety

`--warn` and `--error` each backed **both** text and fill. Rather than hijack
them, new `--health-*` fill tokens were introduced and the gauge/meter/dot were
repointed to them; the base `--warn`/`--error` were repointed to AA-safe text
hues (`#956210` / `#c0453b`), keeping every existing text consumer (tags, pills,
form/toast errors) AA with no per-site edits. `--warn-soft`/`--error-soft` stay
defined.

## Scope

Two files: `src/renderer/App.tsx` (glyph component + 3 render sites, removed the
unused `mark` field) and `src/renderer/styles.css` (tokens, provider-mark tile,
`.account-card::before` edge, gauge/meter/dot remap, forced-colors fallback). No
main-process, IPC, or security code touched. All locked test contracts preserved.

## Verification

format · typecheck · 158 vitest · 5 Playwright — all green. Visual capture
confirmed both axes: coral-spark Claude vs ink-blossom Codex columns at a glance,
and safe-green / low-amber / critical-brick rings coexisting with provider hue on
the same card without confusion.

## Process

Designed via a multi-agent workflow: parallel research (brand facts / WCAG
contrast / current-state + locked contracts) → a 3-lens design panel (instrument
/ brand-forward / dataviz) → a judge that synthesised one build spec (dataviz
base, grafting the white glyph tile and the `::before` edge). A second workflow
adversarially reviewed the diff (test-safety / WCAG / CSS / brand), verifying
each finding before it counted.
