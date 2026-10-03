# Petros Phase 3 verification results

Date: 2 October 2026. Status: **PASS — bounded synthetic Phase 3 engineering slice, P3-V1 through P3-V12**. The shared declarative engine, reference models, held-out composition, live workspace continuity and required verification passed on one recorded source identity. This report does not authorize a pilot or deployment; the separate authority and unavailable-capability gates below remain open.

## Source and authority

Workspace `/Volumes/Chris/Edrion Labs`; dirty branch `new-student-UI`; HEAD `89c1ca29c117b2f9926e97e12a2738fa110cd2ca`. No commit, push, PR, publication, deployment, reset or discard was performed. No applicable AGENTS.md was found. The mandatory plans, reports, owner/product decisions, README and development conventions were read completely before edits; live implementation owners were traced. The Phase 2 freeze was evidence for its own identity. A fresh baseline dependency closure ran before Phase 3, and affected owners run again below.

Verified source: [frozen-r4-oct2/identity.json](verification/petros-phase3-20260928/frozen-r4-oct2/identity.json). Source manifest SHA-256 `db526cc2f3915935846aa3abba52021c2458dcf87b496698fbeec61ea6001e8a`, 2,576 files. This selects tracked plus nonignored untracked source; the manifest and binary tracked diff preserve the preexisting dirty work. The identity JSON declares the excluded verification artifacts/evolving reports and ignored runtime/build/dependency output. The [post-verification identity](verification/petros-phase3-20260928/verified-r4-oct2/identity.json) matches this source manifest and all protected hashes exactly. The [closing identity](verification/petros-phase3-20260928/closing-r4-oct2/identity.json), captured after report/ledger reconciliation, also matches. Final report/ledger edits are excluded as declared; no implementation change followed the freeze. The closing whitespace check exits 0.

Protected file hashes, unchanged from the Phase 2 baseline:

| File | SHA-256 |
|---|---|
| `edrion_database_dump.sql` | `6a3d616e8f215a071a25c7ed717f6b03a2aee514ecce87ef2b7dbb5a512f4b4d` |
| `edrion_database_dump.sql.gz` | `a281acd5986dac80e4b0326b7f2c9a09249f73411ffd4951c59c01ddc5eb918b` |
| `pnpm-lock.yaml` | `803ebf8798958d62a0a7e5ef905a97240c98e97b0d7dadcbff45027123378808` |
| Phase 1 verification report | `4ded55f3a32a0df70da581551596e27c045658c606989da6ddaed780df0b47d8` |

No protected dump was restored. PostgreSQL clusters and Redis were private, local and disposable. The full AppModule fixture clears inherited application credentials, does not load the root `.env`, uses synthetic authenticated student sessions, and denies provider execution through a controlled adapter. Root public-env loading is explicitly skipped in the isolated Next runtime. All admissions remain default-off outside that disposable fixture.

## Implemented owners

The v2 VisualProgram is separate from frozen S7 v1. Compiler, interpreter, bindings, time/controller, numerical capabilities and rendering adapters have separate modules. Programs contain bounded data and typed expressions, never generated JavaScript. JSON preflight denies executable/accessor/prototype/cycle/nonfinite/size attacks; compilation checks exact owner/source/concept binding, dimensions, references, dependency cycles, capabilities/versions, input domains and budgets. No coupled constraint solver is supported, so algebraic cycles are denied. A program cannot register a solver or self-attest scientific approval. The platform report pins trusted kernel assumptions and solver/renderer identities.

The registry describes version, trust, units, ranges, fixtures, limits, licensing and unsupported behavior. Executable extensions remain disabled: neither this worker nor the typed language establishes arbitrary executable isolation. The worker schedules only fixed platform code, accepts strict bounded messages and preserves the acknowledged state after failure. Internally computed model/DAG/plot caches cannot be supplied by the client or mutated by returned view data. Local parameter/view changes have no provider dependency.

Projectile, nonlinear ideal pendulum, and initial directed-series DC/RC models share parameters, timeline, semantic entities, vectors/plots/readouts, descriptions, draft/teaching state, checkpoints, branches and owner operations. Circuit topology/ports are separate from schematic coordinates. The independently authored projectile/DC mixed fixture reaches the same compiler, owner endpoint and React renderer as ordinary program data. Presets are conveniences, not root dispatch types. The spatial foundation is a fixed **oblique parallel projection** of CC0 semantic points, with keyboard selection and original xyz coordinates as an equivalent route; it makes no physics/field/fidelity claim.

Five separate states are persisted: program revision, execution, presentation, student draft and teaching. Structural changes require the current revision/experiment/draft versions and operation hash, validate offscreen, and replace atomically while paused with an explicit reset. Physical parameter edits restart except supported circuit switching interventions. Seek is analytic evaluation or forward replay; no backward integration of dissipative behavior. No stochastic capability is enabled, so seeds are not applicable. Immutable receipts make lost-response retry exact; changed payloads conflict. Writes, checkpoints, interaction events and audit are atomic. Current student/course/portal/source/reviewer/pack/policy/assignment/capability authority is rechecked, including stored reads and retries.

The same canonical provider serves lesson, companion and expanded scene. Semantic selection, isolate/restore, representations, notes and confirmed narration cursor survive moves. Model events anchor beats (the apex is a solver event). Speech and simulation clocks are distinct; interruption cancels speech promptly and visibly freezes or continues the simulation. Resume uses the saved branch, time, beat, seconds and confirmed character. Browsers that lack speech-boundary events disclose their last-confirmed-position limit. The companion scene scrolls within its panel. Unchanged numeric blur is not an experiment mutation. Reduced motion defaults to steps, with continuous playback requiring explicit opt-in.

Workspace prediction prompts pin checkpoint/program/model/solver/parameters/time and server reference criteria. The server recomputes the result; client success assertions are not accepted. Assistance and unknown outside help remain explicit. These future-output checks are **observation-only**, because their heuristic tolerance is not an independently reviewed rubric and their plots may already expose the outcome. They cannot admit mastery. The separately reviewed projectile transfer task remains the eligible assessment path through Phase 2 loop/evidence owners; the combined owner journey verifies that boundary. No automatic teacher feed, numeric qualitative projection, cohort inference or misconduct inference was introduced.

## Verification gates

| Gate (all PASS within the declared supported tier) | Engineering proof / bounded acceptance |
|---|---|
| P3-V1 | Strict v2/version negotiation, old S7 legacy adapter and old-client regression; unknown/disabled/version-mismatched capability denied. |
| P3-V2 | Typed DAG/discrete expressions, dimensional consistency, reference closure, constrained inverse inputs; cycles, nonfinite domains, executable/code/URL/prototype payloads and resource excess denied. |
| P3-V3 | Registry metadata and licensed original fixture; executable tier disabled with explicit unproved isolation gate; unavailable/error fallback keeps last acknowledged state. |
| P3-V4 | Existing projectile analytic owner reused; shared motion/vectors/trajectory/plots/equations/data and apex clock; references and zero-provider controls. |
| P3-V5 | Nonlinear RK4 pendulum, declared ideal assumptions/domain, independent reference/elliptic period, energy tolerance, mass-independent motion with mass-scaled forces/energy. |
| P3-V6 | DC/RC directed-series node/loop relationships, switch history, initial charge/voltage, positive current convention, exact analytic references, units and unsupported topology denial. |
| P3-V7 | Three-version conflicts, draft preservation, current authority and revocation, same-op receipt/changed hash, atomic rollback, cancellation and lost-response recovery through real app-role owners. |
| P3-V8 | Owner checkpoint branches, analytic/forward replay, discontinuous switch interventions, restarts vs display changes, solver incompatibility and unacknowledged interval disclosure. |
| P3-V9 | Browser lesson/companion/modal continuity; keyboard semantic selection, isolate/restore/views, draft retention, apex event, controlled speech boundary interrupt/resume, and lesson-owner navigation pause/resume. |
| P3-V10 | Hidden server reference evaluation/uncertainty and no mastery from workspace exploration. Same-session reviewed transfer assessment remains eligible; Phase 2 append-only correction/sharing/submission-time privacy closure rerun. |
| P3-V11 | Numeric labels, keyboard alternatives/focus handling, descriptions and plot data tables, default reduced-motion steps, mobile width, gated spatial coordinate route. Physical assistive-device acceptance remains open. |
| P3-V12 | Independently authored mixed model program through data alone; real-owner integrated journey, styled full-AppModule browser and affected Phase 1/2/security/build closure on the recorded identity. |

Final verification commands run from the workspace root through the evidence logger (`PETROS_LOCAL_DB_TESTS=1`). Each link preserves the exact command, UTC interval and exit code; paired `.log` files preserve output. Prior successful runs across changed owners do not establish this identity.

| Frozen-r4 check | Command / result |
|---|---|
| Schema and web tests | `pnpm --filter @edrion/schemas --filter @edrion/student-web test` — [exit 0](verification/petros-phase3-20260928/frozen-r4-schema-web.json); 60 files / 475 schema tests, 33 files / 181 web tests. |
| API build | `pnpm --filter @edrion/api build` — [exit 0](verification/petros-phase3-20260928/frozen-r4-api-build.json). |
| Student production build | `env PETROS_ISOLATED_VERIFICATION=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3407 pnpm --filter @edrion/student-web build` — [exit 0](verification/petros-phase3-20260928/frozen-r4-web-build.json). |
| Lint | `pnpm --filter @edrion/schemas --filter @edrion/config --filter @edrion/database --filter @edrion/api --filter @edrion/student-web lint` — [exit 0](verification/petros-phase3-20260928/frozen-r4-lint.json); API reports 729 warnings, zero errors. |
| Typechecks after builds | Same five package filters with `typecheck` — [exit 0](verification/petros-phase3-20260928/frozen-r4-typechecks.json). |
| Affected API/dependency closure | Exact selected Vitest directories and single-fork options in [command envelope](verification/petros-phase3-20260928/frozen-r4-api-closure.json) — exit 0, 67 files / 583 tests. Includes app-role migration, RLS/grants, rollback/reapply, recovery, Phase 1/2 compatibility and security. |
| Full styled browser journey | `pnpm --filter @edrion/api exec node src/modules/integrations/petros-phase3-browser-journey.mjs` — [exit 0](verification/petros-phase3-20260928/frozen-r4-browser.json), [journey record](verification/petros-phase3-20260928/frozen-r4-browser-journey.json). Fresh private full AppModule and real authenticated Next route; visually inspected screenshots, no page errors, 390 px mobile width. |
| Whitespace diff | `git diff --check` — [exit 0](verification/petros-phase3-20260928/frozen-r4-diff-check.json). |


## Numerical reference boundary

Projectile launch/apex/contact checks independently derive closed-form SI values (12-decimal checks), with uniform gravity, no drag and level-ground contact only. Pendulum RK4 uses fixed 0.001 s steps and a final partial step, release from rest, length 0.1–10 m, gravity 1–25 m/s², mass 0.01–100 kg, release angle ±1.4 rad, bounded 60 s kernel runs (8 s reference program). An independent 0.000025 s RK4 reference checks angle to 9 decimals and angular velocity to 7; elliptic-integral period and small-angle limit are independently checked, as are all domain corners over 60 s with relative energy error below 1e-6. Identical parameters at two masses yield identical motion; forces and energies scale by mass.

DC verifies KVL and equal branch current with open/closed switch boundaries. RC checks `Vc=Vs+(Vc0−Vs)exp(−t/RC)`, charge `CVc`, energy `CVc²/2`, KVL/current, zero-source discharge and retained open-switch charge to 12 decimals. Events are replayed forward piecewise. Only the declared single series topology is allowed; no arbitrary network, electromagnetic field, electron-speed, nonlinear component, parasitic or thermal claim is made. Numerical engineering validation does not confer educator approval.

## Integrated journeys

`petros-phase3-journey.integration.spec.ts` uses current source, reviewer, pack, curriculum, policy, session, auth and app-role database owners. It verifies a reviewed synthetic apex misconception, isolate and linked views, shared projectile state, draft/interruption/resume, checkpoint branch, lost receipt replay, stale and changed-payload denial; pendulum/DC/RC and unfamiliar mixed composition; invalid units/capability denial; changed assignment, portal and permission authority; separate app-role canonical-profile creation race; and migration rollback/reapply. Workspace numerical prediction, authority/revocation/races and write/audit rollback run in `petros-workspace.integration.spec.ts`.

The affected Phase 2 full journey now takes a workspace detour at its actual reviewed projectile diagram, saves notes and interrupts/resumes, proves objective evidence unchanged, then continues to the separate unseen transfer assessment through actual loop and objective-evidence services. That reviewed task records numeric reference/rubric, exact pack/source/task/evaluator provenance, no observed Petros assistance and unknown outside help, and retains its eligible projection. This is not a new rubric for arbitrary workspace predictions. Phase 1 literal S1–S11 and Phase 2 assignment/privacy/qualitative/recovery negative journeys run again in the final API closure.

The browser runner uses real cookie authentication, the styled student session route and full AppModule against fresh private PostgreSQL/Redis, not a component harness. It selects a semantic object by keyboard, isolates, switches views/restores, seeks the solver apex, saves notes, receives a controlled speech boundary at character 20 / 2 s, interrupts/freezes, expands/resumes/returns, changes projectile vx, opts into continuous playback and verifies that representation changes acknowledge the displayed time before continuing, rejects invalid units over real HTTP without a write, opens/recloses/rewinds circuit switches with matching controls, drops the HTTP response after an acknowledged Step commit, retries the identical operation without a second version, observes stale-write 409, branches from checkpoint, submits an observation-only prediction, manipulates pendulum mass and DC/RC switches, selects spatial depth by keyboard, and steps the unfamiliar combined program. It then resumes the paused original lesson, refreshes its acknowledged workspace, preserves its draft, closes the companion and expands at 390×844. Chromium 154.0.8037.58 reports no page errors and document width equals viewport width. Final mobile, RC, spatial and held-out combined screenshots were inspected visually. The [server shutdown summary](verification/petros-phase3-20260928/frozen-r4-server-summary.json) records zero provider calls. The [private AppModule server](verification/petros-phase3-20260928/frozen-r4-browser-server.json) and isolated Next server closed cleanly; disposable database/Redis resources were removed. Speech is a controlled browser-boundary adapter; physical narration/device validation is not claimed.

## Migration and rollback evidence

Migration 0227 is registered in the journal and adds current workspace plus immutable checkpoint, operation, prediction-challenge and prediction-response tables. Composite owner foreign keys, forced student/institution RLS and app-role grants are applied. Only the current workspace may be updated; app role cannot update/delete immutable history or delete current workspace. A final grant replay regression was repaired so broad grants cannot reopen prediction history mutations.

The private-cluster test reads all five table RLS/force/grant facts, removes 0227 objects transactionally, confirms absence, reapplies the exact migration statements, and checks identical grants plus policies/triggers. This is migration/rollback engineering evidence on disposable data, not a production downgrade authorization. Operational rollback keeps the default-off workspace flag off and leaves historical rows intact pending an authorized retention/downgrade decision. No shared development or production database was migrated by this task.

## Repairs and retained failures

Historical failed commands remain linked in the command index. Repairs cover stale current authority on checkpoint restoration; mismatched spatial projection claims/geometry; mutable/caller-supplied caches; exact speech cursor; malformed bodies returning 400; replayed grants reopening prediction writes; topic-profile duplicate bootstrap across instances and cache-key collision; empty/unchanged numeric blur; companion content outside its scroll container; browser response/DOM synchronization and legitimate lesson-owner resume; generated Next directories being linted as source; the missing projectile constant import during assumption-label cleanup; modal opener focus captured before the trigger is disabled; and effective circuit controls after switch replay. Simultaneous web build/typecheck also raced on regenerated ignored Next type files; the final typecheck is rerun after build. None of those failed attempts is counted as closure.

## Remaining authority and unavailable capability gates

| Open gate | Authority/dependency and current effect |
|---|---|
| Generated executable isolation | No demonstrated denied ambient network/imports or hard CPU/memory containment; tier disabled, S7 not weakened. |
| Real educational approval | No named qualified educator, canonical curriculum import, real reviewer approval/enrollment or reviewed pendulum/circuit pedagogy and independent prediction rubrics. Candidate projectile source/review packet remain candidates for real adoption. Only labelled synthetic reviews exist. |
| Retention and institutional privacy acceptance | Institution/product/legal owners have not approved real-data retention/erasure, sharing, age/cohort policy or pilot processing. Synthetic engineering cannot decide these. |
| Physical-device accessibility and speech | Keyboard/reduced-motion/mobile/structured alternatives verified in browser and tests; actual assistive technology, target devices and speech-boundary support still need user/qualified acceptance. |
| Additional scientific capabilities | Unsupported solvers/topologies/3D fidelity/coupled cycles remain unavailable. Adding them requires explicit registry validation fixtures and review, not plausible animation. |
| Pilot/rollout | No consented real cohort or pilot authorization; workspace/Phase 2 flags stay default-off. No deploy/publication occurred. |

Completed workers use lower agents for bounded tasks and were stopped when finished. Earlier interrupted/failed agent work was inspected and independently rerun; no heavy-agent output substitutes for evidence.
