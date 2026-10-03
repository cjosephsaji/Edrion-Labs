# Student UI corner consistency follow-up — 2026-10-03

The student portal used global `border-radius: 0 !important` rules on sections, articles, rounded utility classes and form controls. Those rules overrode page-specific styling and caused square Petros surfaces beside rounded navigation and material cards.

Removed the forced-square rules. Added student aliases for existing design tokens: controls 8px, inset panels 12px, cards 16px, and pills/circles fully rounded. Applied that hierarchy to shared primitives and page/component styles across learning, Petros, materials, saved artifacts, courses/classes, exams, settings, calendar and the document reader. Normalized asymmetric lesson cards and kept their accent strips inside the curved corners. Settings theme samples and segmented controls now match; the calendar has a rounded outer frame.

Full-screen readers, backdrops, joined edges, document pages, table cells, separators, native checkboxes and radio controls retain their structural geometry. This change affects student presentation only; API, permissions, admissions flags, learning behavior, dependencies and generated design-token source remain unchanged.

## Verification

- Production Next build, including type checking: passed. See `student-preview-final-r3.log`.
- Student lint: passed with four existing warnings and zero errors. See `lint-final.log`.
- `git diff --check -- apps/student-web`: passed.
- Browser visual/overflow verification: 31 route pages plus a fresh lesson (32 pages total), and three dialogs, each at 1440px desktop and 390px mobile widths: 70 checks passed, zero page exceptions, zero horizontal-overflow failures. The final checks are recorded in `browser-check-final-r6.log`; the route pass is recorded in `browser-check-final-r5.log`.
- Verification uses installed Chrome and the existing disposable synthetic fixture. Results and actual rendered states are in `browser-report.json`; top-level route results are in `routes-report.json`.
- Some institutional modules have no populated data in this Petros fixture; the browser records their actual loading/error/empty state. Page-specific styles were audited in source, and shared populated/empty/error controls were inspected through the design-system page. This is visual verification, not a new complete Phase 6 functional acceptance run.

`style-changes.diff` compares CSS with the snapshot immediately before this follow-up, preserving the pre-existing dirty checkout. `style-manifest.json` records those before/after hashes. Two TSX files additionally received presentation classes: Settings and Calendar.

The authenticated local preview remains at http://127.0.0.1:3422/student. `active-review-runtimes.json` records the updated preview services. No commit, push or deployment was performed.
