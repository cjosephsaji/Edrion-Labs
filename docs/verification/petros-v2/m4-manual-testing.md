# M4 manual student UI review

**M4 introduces significant student-facing UI changes. Manual visual review is required before M5.**

The local API and student app are running on **127.0.0.1:4943** and **127.0.0.1:4944**. Use the links below on this Mac. The handoff signs in a synthetic institutional student through the existing student session owner, then redirects to the actual student app. No real credentials are needed. Use one role at a time: switching roles changes the browser cookie. Avoid mixing `localhost` and `127.0.0.1`.

## Open each state

| State | Exact localhost link |
| --- | --- |
| Entry / start a session | [Open available lessons](http://127.0.0.1:4943/demo/entry) |
| Lesson delivery | [Read the Cloud lesson](http://127.0.0.1:4943/demo/delivery) |
| Active question | [Try the Cloud question](http://127.0.0.1:4943/demo/question) |
| Submitted / pending | [See a durably submitted answer being checked](http://127.0.0.1:4943/demo/pending) |
| Feedback | [See deterministic feedback](http://127.0.0.1:4943/demo/feedback) |
| Paused lesson | [Open the paused draft](http://127.0.0.1:4943/demo/paused) |
| Resume | Open the paused link, then select **Continue learning** |
| Withdrawn source | [See the unavailable lesson](http://127.0.0.1:4943/demo/blocked) |
| Mobile question | [Open the mobile test student](http://127.0.0.1:4943/demo/mobile) |
| English qualitative review | [Try the English passage](http://127.0.0.1:4943/demo/english) |
| Existing V1 session | [Open the original V1 paused session](http://127.0.0.1:4943/demo/v1) |

The app entry is [http://127.0.0.1:4944/petros/v2](http://127.0.0.1:4944/petros/v2). Open a handoff first to establish the synthetic student cookie. The server selects the engine; V2 opens `/petros/v2/session?session=...` and V1 retains `/petros/session?session=...`. Current session URLs can be inspected in the loopback-only [demo information](http://127.0.0.1:4943/demo-info). There are no live users in this database.

## Try the complete flow

1. Open **available lessons**, choose Cloud Computing, and press **Start learning** (or **Continue learning** if already started). Read the short source-backed explanation.
2. Select **Try a question**. Choose one answer, select **Save draft**, then **Pause lesson**. Reload. Select **Continue learning** and check that your saved selection remains.
3. Complete both selections and press **Submit answer** once. A second click or retry must not create another answer. The accepted response remains visible after reload.
4. For a correct deterministic example, choose **The consumer** and **The consumer retains access-policy responsibilities**. An incorrect selection receives criterion-specific negative feedback. This is a two-selection classification task, not a qualified assessment of prose reasoning. One answer never establishes mastery.
5. Use the pending link to inspect **Answer submitted. Checking your response…**. The isolated pending actor has an intentional eight-second evaluator delay. Reload during that interval: your answer stays saved. This delay is for inspection and makes no provider-performance claim.
6. Open **Your workspace**, change the working note, and tab out to acknowledge a semantic edit. Undo/redo appends saved checkpoints before submission. After submission the accepted work is frozen. Use **About this source** for the public citation and limitations.
7. Open the English role. Read the passage, enter a plausible explanation or alternative interpretation, and submit. The expected honest result is **Teacher review needed**, with no independent criteria inferred from an unqualified model.
8. Open the withdrawn-source role. Further instruction and submission must be blocked; the API retains the student's original response and evaluation history. Source withdrawal was performed only in this disposable fixture.
9. Open the mobile role. In Chrome DevTools, enable the device toolbar, set width **360** and height **800**, and reload. Also inspect 390, 768, 1280, and 1440px. Tab through inputs/buttons, check visible focus, scroll to Submit, and ensure no horizontal overflow or companion overlap. Automation used desktop Chrome emulation, not a physical device or human screen-reader evaluation.
10. Open the V1 role. Its original session is paused. Check the existing interface, saved work and resume/pause behavior. Do not expect new M4 feedback semantics in this V1 session.

The active-question and English handoffs create another legitimately admitted task only if their prior answer was already committed/closed. Repeat exposure remains recorded; it cannot inflate independent learning. The paused and feedback handoffs preserve their saved records.

## Screenshots and evidence

[Open the screenshot gallery](m4-20261015T124002Z/demo-final-review-20261015T174107Z/screenshots.html) · [browser checks](m4-20261015T124002Z/demo-final-review-20261015T174107Z/browser/browser-results.json) · [full verification report](m4-student-sessions-and-assessment.md)

- [Student session entry](m4-20261015T124002Z/demo-final-review-20261015T174107Z/browser/01-entry.png)
- [Source-backed lesson delivery](m4-20261015T124002Z/demo-final-review-20261015T174107Z/browser/02-delivery.png)
- [Active assessment](m4-20261015T124002Z/demo-final-review-20261015T174107Z/browser/03-question.png)
- [Durable answer, evaluation pending](m4-20261015T124002Z/demo-final-review-20261015T174107Z/browser/04-pending.png)
- [Deterministic criterion feedback](m4-20261015T124002Z/demo-final-review-20261015T174107Z/browser/05-feedback.png)
- [Paused saved lesson](m4-20261015T124002Z/demo-final-review-20261015T174107Z/browser/06-pause-resume.png)
- [360px mobile](m4-20261015T124002Z/demo-final-review-20261015T174107Z/browser/07-mobile-360.png)
- [Withdrawn source](m4-20261015T124002Z/demo-final-review-20261015T174107Z/browser/08-source-unavailable.png)

## Restart only this disposable demonstration if needed

Use Node 24.21.0, PostgreSQL 15 and Redis executables. Do not load the workspace `.env`, provide a database URL, run the migration CLI against a configured target, or kill unrelated development servers. The API demonstration script refuses configured database/PG targets and creates a new private cluster. Choose a fresh timestamped output directory rather than reusing an old receipt directory.

From `apps/api`, set `PETROS_M4_EVIDENCE_DIR` to that new directory and run:

```sh
node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/serve-petros-m4.ts
```

From `apps/student-web`, run the isolated UI:

```sh
PETROS_ISOLATED_VERIFICATION=1 PETROS_M4_VERIFICATION=1 \
NEXT_PUBLIC_PETROS_M4_DEMO=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4943 \
node node_modules/next/dist/bin/next dev -p 4944 -H 127.0.0.1
```

The demonstration starts its own private Redis/BullMQ workers. Shutdown removes only its disposable cluster. The product capability remains disabled by default outside this isolated process. No deployment, paid inference, real academic approval, or actual student publication is part of this demonstration.

**Stop at M4. M5 requires human visual approval and disposition of the verification report's open limitations.**
