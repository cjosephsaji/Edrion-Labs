# NTA reference assets — DEFERRED (D-T2-017)

Frozen Tier 3 Entrance Prep contract. Pixel-for-pixel NTA skin must match checked-in
screenshots + exact hex samples in this folder.

## Status: DEFERRED

D6 ships **paper** skin + **standard** skin. Declared blueprint `skin='nta'` remains a
**reserved enum value** and resolves at render time to the standard player via
`resolveRenderSkin` (`nta → standard`), with a dismissible coming-soon note.

Do **not** invent NTA layout pixels. Do **not** add fabricated
`desktop-question.png` / `colors.json` / `buttons.json` here until approved.

## Reversal trigger

When approved assets land in this folder:

- `desktop-question.png`
- `desktop-palette-states.png`
- `mobile-compressed.png`
- `colors.json` — exact hex for palette states
- `buttons.json` — exact labels + order
- `SOURCE.md` — viewport, NTA source/version, approval date

…resume the frozen-NTA D6 work (bespoke `players/nta/*` component swap) and add the
pixel visual-regression gate. No skin-enum migration required — only a component
swap on the skin-resolver.

## Tier 3 note

Entrance Prep must not assume a live `nta`-skinned component exists yet. It
consumes paper-pattern / blueprint shape (D2) + the standard player until then.
