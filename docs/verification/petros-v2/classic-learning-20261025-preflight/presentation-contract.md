# Classic and Petros World: shared presentation design

25 October 2026. **Architecture preparation only.** This document adds no runtime
mode, event schema, teaching policy, evaluator logic, 3D dependency or renderer.
The Classic implementation uses the inspected `docs/petros_vm_thought_cloud_prototype.html`
as its visual reference. Its simulated logic and embedded artwork were not imported.

## Existing owners

| Responsibility | Existing implementation |
| --- | --- |
| Durable session, current publication, permissions, revisions, commands | `apps/api/src/modules/student/petros-v2/petros-v2-session.service.ts` and repository |
| Immutable submissions and private criterion evaluation | `petros-v2-assessment.service.ts`, command worker and existing response/evidence stores |
| Public companion event construction | `apps/api/src/modules/student/petros-v2/petros-companion-cues.ts` |
| Public event validation | `packages/schemas/src/petros-v2/companion.ts` |
| Current event admission and supported attention | `apps/student-web/src/features/petros-v2/companion/companion-controller.ts` |
| Shared teaching timeline and interruption | `presentation-controller.ts`, `use-studio-experience.ts`, current teaching state |
| Authorized session reads, saves and submissions | `use-petros-session.ts` |
| Target ownership and measured visibility | `apps/student-web/src/features/learning-studio/target-registry.tsx` |
| Current original-art rendering and fallback | `companion-rig.tsx`, `companion-policy.ts`, selected `manifest.json` |

Paths without a directory in this table are relative to their preceding feature
or service directory. These remain the owners across both presentation modes.

## Contract reuse and proposed presentation intentions

Retain `petros.v2.companion-event.v1` as the accepted public event envelope.
It already carries event/session/activity identities, session revision and epoch,
activity revision, source revision and hash, action/beat identity, semantic target,
public caption, assistance policy, actual public result, priority and validity
timestamps. `acknowledgment: presentation-only` grants no academic authority.

The following intention names describe adapter behavior; they are **not additional
wire enum values**. An adapter derives them from an admitted event and its matching
acknowledged snapshot. Do not infer event categories by searching caption strings.

| Meaningful intention | Authoritative evidence | Classic expression | Future World expression |
| --- | --- | --- | --- |
| Present question | Current authorized task or participating activity | Question in workspace; optional brief speech | Board and accessible React question; approved station attention |
| Acknowledge saved prediction | Committed receipt plus matching attempt in fresh snapshot | Short speech; preserve selected answer | Same caption; optional approved acknowledgment clip |
| Focus model element | Admitted action/beat and current registered target | Element emphasis; original point pose only if supported and visible | Semantic station/board anchor and approved articulated pointing |
| Report accepted simulation action | Matching attempt observation with `admitted: true` | Update model; no routine automatic dialogue | Update same model; no routine interruption |
| Report refused simulation action | Matching observation with `admitted: false` | Amber notice and persistent workspace consequence | Same readable consequence; optional approved attention gesture |
| Yield to student | Input focus/manipulation or independent task | Original neutral avatar, suppress automatic cloud | Settle; yield React workspace; stop camera motion |
| Present requested authorized help | Allowed `hint`/`ask` receipt and current public source response | Persistent thought cloud with approved text | Same help and transcript; approved look/gesture only |
| Report actual evaluation | Evaluation linked to committed response and valid current authority | Truthful correct/partial/incorrect/review/unavailable wording | Same wording and evidence; only approved corresponding clips |
| Stop presentation | Interrupt, pause, hidden page, revocation, navigation or renderer disposal | Cancel cloud and attention immediately | Cancel clips, path, camera transition and speech at once |
| Resume current work | Reconciled authorized snapshot and existing checkpoint/timeline | Restore current work; do not replay old popups | Restore same work at a safe station; no repeated response submission |

The public event schema's `priority` and lifetime are reused. The implemented
`companion/classic-cloud-controller.ts` delegates admission to the existing M6
`CompanionController` and adds one supplemental cloud lifecycle. `classic-companion.tsx`
owns its single next-deadline timer. No lesson component adds a cloud timer, and
the existing rig yields the Classic VM surface to this renderer. Other lessons
keep the original shared rig. No second pedagogical state machine was added.

## Planned cloud lifecycle

Bind a presentation to authenticated owner, session, activity, branch, task instance,
teaching action, source revision/hash, epoch, canvas revision and relevant attempt/model identity. `CompanionEvent`
does not currently carry attempt/model pins: derive and verify these against the
same snapshot for a model event. Any future schema addition must be versioned and
retain compatibility with existing published events and historical checkpoints.

Admission must continue checking the exact accepted event, current source/activity,
epoch, event expiry, assessment state, commitment, input state, page visibility and
target availability. A client event is never authority to expose a hint or grade.
Only one admitted current cue is visible. Replace lower-priority automatic cues;
discard obsolete cues rather than queueing them for later.

Proposed precedence: invalidation/security/error; requested help; significant model
outcome; stage transition; optional introduction. Invalidation cancels requested
help too. Equal-priority replacement requires a newer relevant event in the same
current scope. A routine accepted allocation emits no cloud.

Use one lifecycle schedule owned by the existing presentation/controller boundary:

| Cue | Delay / visibility target |
| --- | --- |
| First authorized ready introduction | 600–800 ms delay, then about 4 s |
| Confirmed prediction save | About 2.7 s |
| Confirmed insufficient-memory refusal | About 6 s |
| Legitimate explanation-stage entry | About 3.8 s |
| Confirmed non-graded explanation save | About 4 s |
| Explicit requested help | Until dismissal/replacement or authority expiry |

An expiry callback must compare both scope and event identity before clearing
anything. Cancel callbacks on replacement, unmount, session change and revocation.
A seen/dismissed event must not replay merely because an ordinary save or polling
read rerenders the component. An identical semantic event republished with new
read-time timestamps does not earn a fresh display. Scope history must be bounded.
Do not persist private captions or help across users in local storage.

The event envelope currently expires within 120 seconds. Persistent requested help
must not override that authority limit: keep the panel available, clear expired
content, and reconcile/retrieve authorized public content through the existing
service if the student requests it again. Do not silently extend an old event.

On input focus, clear nonessential automatic speech without moving focus. Do not
reopen it on every blur or keystroke. Requested help must never overlap inputs.
Dismiss is a keyboard button; restore focus to its stable trigger only when the
focused dismiss button disappears. Automatic expiry never steals focus. Essential
outcomes remain in the workspace after cloud dismissal. Reduced motion displays
the final state directly, with no cloud scale, bounce, bar pulse or ghost movement.

## Current policy conflicts that presentation cannot bypass

1. `allocationPredictionSchema` stores a requested count and `fits/does_not_fit`,
   not a student's predicted maximum capacity. `executeAllocation` requires an
   exact prediction for each student increase. A total-capacity guess cannot be
   converted into several fabricated per-operation answers. Preserve that rule
   and make its small prediction step clear within Try it when adapting the
   existing activity. A genuinely different activity needs its own reviewed,
   versioned policy; a visual prototype cannot supply one.
2. The independent issued task may have multiple structured fields. Preserve its
   actual response format and formal evaluation boundary; do not turn it into
   easier multiple-choice questions or expose the assisted memory lesson early.
3. The reviewed teaching fragment may already have allocated a demonstration VM.
   Render the acknowledged starting state. Do not reset to zero on mount merely
   to resemble the prototype; a reset is an explicit audited operation.
4. `ask` currently records source access and rereads authorized source wording.
   `hint` is allowed only for an issued `assisted_practice` task and records
   answer-relevant exposure. Neither is a generic generated hint service.
   The participating projection omits `ask` although its existing server handler
   admits post-commit source access. Classic requests that existing command only
   during reviewed post-commit teaching, after the existing interrupt/checkpoint
   workflow, and waits for its real receipt and fresh source projection. No server
   authorization or action-admission rule changed. Restricted independent help
   shows an unavailable reason; present unavailable/retry states
   when no qualified hint is available. Never paste the brief's example hint as
   though it came from the service.
5. The current memory kernel supports equal VM sizes and a memory-only hard
   capacity. It has no reviewed overcommit or heterogeneous-size mode. Never
   claim those capabilities; future kernels need their own authorized adapters.

## Correction, draft and renderer independence

Keep predictions, observations and explanations joined by current attempt ID,
session/activity/branch identity, source pins and model revision. Continue using
`currentAllocationAttempt` and `allocationAttemptObservation`; never select the
latest prediction and latest observation independently. Reset/release/undo retain
their current audit semantics and cannot resurrect a prior active attempt.

Keep explanation editing in the current draft owner. A checkpoint save is not an
evaluation. On failure retain local text and show the actual error. A hard reload
can restore a backend-saved draft; unsaved in-memory text must not be described as
durable. Existing unload safeguards remain in force.

`practice` must retain the saved-explanation gate and issue an actual eligible
assisted task. Its response is a new immutable response with existing lineage and
exposure evidence. Only the private evaluator can populate actual criteria. Missing
fresh verification, qualitative review and unavailable evaluation remain explicit.

Both renderers consume these public facts. They never create academic responses,
approve content, select a checker, estimate correctness or bypass receipt recovery.
World station coordinates, paths, camera settings and animation clip names belong
to a renderer capability manifest, never to an evaluator or source qualification.

## Required focused regressions for implementation

- Same admitted event produces equivalent public information in either renderer.
- No stale/cross-owner/session/source/model/attempt cue; no queued obsolete cue.
- One welcome per ready activity; no feedback for mere prediction selection.
- Commit failure has no success cloud; network error is distinct from refusal.
- Accepted allocations update only after confirmation and produce no repeated praise.
- Refused operation leaves accepted tiles/quantities intact; motion is supplemental.
- Dismissal/expiry/replacement cannot let an old callback close a new cloud.
- Editing, visibility, pause and revocation cancel inappropriate presentation.
- Help respects task policy/exposure; assessment never leaks answers through cues.
- Actual evaluator response and response ID govern outcome and assisted wording.
- Renderer disposal/switch does not duplicate submit, mutate history or lose drafts.
- Keyboard, screen reader, long captions, missing targets and reduced motion remain usable.
