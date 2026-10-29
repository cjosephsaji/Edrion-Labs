# M5 adversarial coverage map

This maps all 50 requested categories to executed engineering checks. It does not create 50 additional test cases or claim independent academic/device/production qualification. Several categories share a test because one transaction exercises their interaction. Raw accepted commands/logs are in [executed-commands.jsonl](executed-commands.jsonl). Browser receipts: [main](mobile-touch/artifacts/results.json), [supplement](browser-supplement-handoff/artifacts/results.json).

Test references (repository paths):

- **C** — `apps/api/src/modules/student/petros-v2/petros-m5-contracts.spec.ts`
- **I** — `apps/api/src/modules/student/petros-v2/petros-m5.integration.spec.ts`
- **S** — `packages/schemas/src/petros-v2/teaching-engine.spec.ts`
- **P/Q/A/O/K/R/D** — existing `petros-v2-privacy/assessment/boundaries/ownership/canvas/reliability/commands.integration.spec.ts` respectively, in the same API directory.
- **F** — `apps/student-web/src/features/petros-v2/canvas/session-teaching.spec.tsx`
- **N** — existing `apps/student-web/src/features/petros-v2/playground/narration-playback.spec.ts`
- **G** — existing `apps/student-web/src/features/petros-v2/companion/companion-controller.spec.ts`, `companion-naturalness.spec.tsx`, and `studio-presentation.spec.ts`.
- **B** — main browser runner `apps/api/scripts/verify-petros-m5-browser.mjs`, recordings A–F; supplement adds changed-error, experiment, process and graph checks.

| # | Required category | Observed scope and limits |
|---|---|---|
| 1 | Fabricated source reference | C: fabricated/changed source-pin cases; compiler rejects refs outside the publication. |
| 2 | Cross-tenant source reference | C: borrowed foreign-context source pin rejects; A/O retain owned admission. This is exact-scope enforcement, not a production tenant audit. |
| 3 | Revoked teaching source | C: lost source authority; I: source withdrawal with response-hash preservation. |
| 4 | Changed source revision | C: fabricated/changed sourceRevisionId rejects. |
| 5 | Unapproved claim | C: changed explanation rejects; I: database rejects teaching different from reviewed instrument. |
| 6 | Unsupported equation transformation | C: cancel-symbols and unregistered rules reject. |
| 7 | Division by zero | C: arithmetic and simulation zero divisors reject. |
| 8 | Invalid units | C: wrong result units reject. |
| 9 | Wrong graph endpoint | C: every point is checked against linear-rate output; S rejects duplicate/unordered coordinates. |
| 10 | Deleted target | C: missing edge endpoint rejects; K: protected/deleted targets reject. |
| 11 | Reversed source relationship | C: reversed otherwise-valid arrow rejects after the correctly directed relationship compiles. |
| 12 | Arrow without qualified direction | C: directionReviewed=false fails strict schema admission. |
| 13 | Invalid prerequisite graph | C: cyclic prerequisites reject; S: cyclic canvas ancestry rejects. |
| 14 | Unsupported simulation parameter | C: bounded memory/rate/projectile domain cases reject unsupported values. |
| 15 | Arbitrary executable code | C: code field and javascript kernel reject; trace uses finite inert states, S. |
| 16 | Malformed action schema | C: unsupported fields and malformed provider output reject; P: generic patches/scores reject. |
| 17 | Excessive operation count | C: 33-operation fragment rejects the 32-operation limit. |
| 18 | Missing accessible alternative | C: missing equivalent text capability rejects before selection. |
| 19 | Private assessment reference in public action | I: public teaching snapshots exclude checker/discriminator/sentinel; P: hidden/private source routes denied. Source whitelist excludes private-only references. |
| 20 | Model assigns grade | C: grade field rejected by closed decision and provider schema. |
| 21 | Model approves task | C: approveTask field rejected. |
| 22 | Model changes evidence | C: writeEvidence field rejected. |
| 23 | Protected source alteration | C/K: protected elements reject edits; S protects table labels on edit/restore. |
| 24 | Stale canvas revision | K: stale revision/branch rejected; R: 200 stale revision/epoch cases. |
| 25 | Conflicting student/Petros edits | C: open edit invitation prevents new teaching overwrite; K: competing save/submit uses concurrency checks. |
| 26 | Duplicate edit | I: same canvas_edit command returns identical receipt and exactly one student edge; R exercises durable generic retries. |
| 27 | Duplicate submission | D: duplicate assessment response is idempotent and does not duplicate evidence. |
| 28 | Replay after evaluation | I: new canvas edit after committed evaluation rejects; P denies answer replay; later teaching remains assisted. |
| 29 | Undo after submission | I/K: undo rejects and committed response identity/hash remains. |
| 30 | Interrupted equation reveal | I: first equation prefix survives pause/read/resume; F fences pending scheduler on pause/epoch change. |
| 31 | Interrupted diagram construction | I: one accepted element survives interruption; B/D: pause/reload/resume preserves prefix. |
| 32 | Audio callback after new epoch | Existing N playback tests fence stale audition/media callbacks on pause/interrupt/restart/dispose. M5 adds no speech route; real M5 speech is unqualified. |
| 33 | Source withdrawal during action | I: process action is still presenting when source is withdrawn; remaining step blocked and committed response hashes retained. |
| 34 | Reviewer withdrawal during evaluation | Q: reviewer expiry between evaluation and publication invalidates outcome. |
| 35 | Unsupported avatar gesture | Existing G tests limit supported pose/cue contract and missing targets fall back to neutral; M6 acting remains unavailable. |
| 36 | Controlled output marked genuine | C: authorized_live without genuine provider receipt rejects; controlled origin stays controlled. |
| 37 | Keyword-stuffed answer | Q: free text cannot pass deterministic checker and length yields no correctness; I English interpretation abstains. |
| 38 | Correct final answer, invalid reasoning | Bounded numeric method criteria are checked separately (paired corpus and changed-error browser trace). Unqualified free-form prose reasoning is not marked correct. |
| 39 | Incorrect result, correct partial method | I/B: responsibility and available-memory criteria stay satisfied while capacity fails; focused method repair follows. |
| 40 | Ambiguous valid interpretation | I/B English: alternative reading committed; interpretation remains review_required. |
| 41 | Hint before independent check | Q/A: hinted/source-exposed work excluded from independent evidence; I: fresh boundary retains prior history, later help assisted. |
| 42 | Repeated equivalent task | Q: equivalent repeats remain observations; C: repeated/family evidence cannot establish demonstrated state. |
| 43 | Prediction without explanation | C: non-admitted prediction events, missing explanation, assisted or equivalent events cannot demonstrate learning. Supplement checks experiment runs add no mastery. |
| 44 | Failed evaluation | A: unavailable evaluator retains committed work; C returns review_required rather than repair success. |
| 45 | Empty/contradictory evidence | C: empty ledger not_assessed, uncommitted evidence no hypothesis, contradictions clarify rather than assert. |
| 46 | Renamed source title/subject | C: changing both labels and student identity preserves evidence-conditioned strategy. |
| 47 | Different evidence, canned branch | I: A/B differ; corpus swaps actor responses over 20 pairs per subject. Changed numeric error changes the focused step. |
| 48 | Provider timeout/unavailable | C: thrown timeout or malformed output cannot publish. No live model execution is claimed. |
| 49 | Reduced motion | B/F: actual text-only/reduced-motion edit and commit; F UI unit checks equivalent participation. |
| 50 | Mobile keyboard/touch | B/E: 360px isMobile/hasTouch context and tap saves an equation; labelled keyboard controls checked in UI. Physical keyboard/phone/screen-reader acceptance pending. |
