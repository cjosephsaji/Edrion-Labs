# Institution Admin Panel — Consistency Audit (redesign program)

This records the cross-cutting audit run at the end of the 7-phase admin-panel redesign, what was
fixed, the invariants now expected of every screen, and the few items intentionally deferred.

## The four invariants (every list/entity screen)

1. **Read-only detail on row click.** Clicking a row opens a `DetailPanel` (read-only) — you never
   have to open Edit to see a record. Edit stays a separate pencil action.
   - Delivered generically by `ResourceManager` (row click → `DetailPanel`); every ResourceManager
     screen gets it for free. Bespoke screens carry their own detail (Attention → `DetailPanel`,
     Messages → info panel).
2. **Names, not UUIDs.** Foreign-key columns are resolved to readable `EntityDisplay` values and
   rendered with `<EntityRef>` (avatar + name + sub-line). The raw id is kept for editing only.
   - Backend: `CrudConfig.refs` (declarative, batched) + `PortalEntityResolver`; bespoke services use
     `enrich`. `ResourceManager.autoDetail` skips any `*Id` key so a raw UUID can never leak into the
     auto-built detail.
3. **Real data or a labelled placeholder — never fake.** The Attention Centre marks analytics it
   can't compute yet as `not_yet_available`; messaging attachments show "storage not configured"
   instead of faking uploads.
4. **Settings that actually apply.** Global settings come from a canonical registry and are read via
   `useFormat()` / `useEffectiveSettings()`; currency is wired through fees today, with date/time/
   number formatters ready for the rest.

## What the audit found and fixed

- **Raw IDs:** the only engine-based FK offenders were Health + Counseling (`studentId`). Both now
  return the full student card (name/class/grade/section/campus/age/guardian) and render `<EntityRef>`
  + a student picker. Grep for `render:.*r\.\w+Id` across `app/` and `components/` returns no raw-UUID
  column renders (the one remaining `campusId` use is a "This campus / All campuses" label, not an id).
- **Must-Edit-to-view:** removed as a class of bug — `ResourceManager` opens a detail panel on row
  click for all ~40 directory screens.
- **Recipient selection:** announcements/notifications use the `RecipientPicker` (individuals, classes,
  grades, departments, subjects, campuses, derived parents-of/teachers-of/students-of, broadcasts and
  saved groups) with live counts + preview.
- **Thread-style messaging:** replaced by the conversation-based chat (`/messages`). The dead v1 thread
  UI was removed (`lib/messages.ts`, `lib/messaging-types.ts`, `components/messages/thread-posts-drawer.tsx`).
  The v1 `message_threads`/`message_posts` API + tables are left in place (no UI references them) and
  can be dropped in a later migration.
- **Decorative settings:** the free-form key/value editor was replaced by a curated, typed form over
  the canonical registry; only globally-effective keys remain.

## Verification

Live curl smokes (run against the API on `:3001` with `PORTAL_AUTH_DEV_HEADER=true`, seeded DB):

| Phase | Script | Result |
|------|--------|--------|
| 1 Foundation | `scripts/portal-detail-smoke.sh` | 6/6 |
| 2 Health | `scripts/portal-health-smoke.sh` | 15/15 |
| 3 Recipients | `scripts/portal-recipients-smoke.sh` | 15/15 |
| 4 Messaging | `scripts/portal-messaging-smoke.sh` | 14/14 |
| 5 Attention | `scripts/portal-attention-smoke.sh` | 9/9 |
| 6 Settings | `scripts/portal-settings-smoke.sh` | 8/8 |

`pnpm typecheck` is clean across the workspace. Migrations `0027`–`0029` apply clean-from-empty; new
tables carry tenant RLS (see `migrations/sql/zzz_rls.sql`).

## Deferred (intentional, tracked)

- **Student-performance / learning analytics** (Attention Centre) — placeholders until the student-side
  features exist, per the brief.
- **Message attachment uploads** — metadata + integration-ready endpoint; needs a blob store.
- **Broader `useFormat()` wiring** — date/time/grading formatters exist and are wired into fees
  (currency); rolling them through every dated/graded column is mechanical follow-up.
- **Per-recipient notification inbox** — announcements resolve + record a recipient count/summary;
  a per-person delivered-notifications feed needs the recipient identity model (arrives with messaging
  participants).
- **Drop v1 messaging tables** — safe once confirmed no external consumers.
