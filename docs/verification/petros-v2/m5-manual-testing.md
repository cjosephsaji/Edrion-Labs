# M5 manual review — 19 October 2026

This is a local engineering environment using synthetic institutional students and synthetic review records. It performs actual source extraction, session commands, committed-work evaluation and evidence-conditioned action selection. No real academic qualification, paid inference or production deployment is enabled.

## Open the application

API: **http://127.0.0.1:4943**. Student application: **http://127.0.0.1:4944**. Both returned HTTP 200 at **2026-10-19T06:42:59.825592+00:00**. They are left running for review; if the host closes them, use the restart commands below. The recording gallery is **http://127.0.0.1:4945/review.html**. Use `127.0.0.1` consistently so the synthetic login cookie works. No password is required.

Each link selects its own synthetic student. Adding `?fresh=1` closes only that actor's current synthetic session and starts a new one. Recorded past submissions remain in the disposable database while the API is running. Restarting the API creates a new disposable database; it does not restore an earlier demo database.

## Cloud Student A — relationship repair

1. Open **http://127.0.0.1:4943/demo/cloud-a?fresh=1**.
2. Choose **Provider** for the guest operating system in IaaS. Enter **48** available GB and **6** whole VMs. Submit.
3. Wait for actual feedback. Select **Work on this with Petros**. Expect **Compare the relationship**, motivated by the responsibility criterion. One error is a candidate misunderstanding, not a proven permanent misconception.
4. Use **Show next teaching step** or **Play demonstration**. The source passage and diagram elements are accepted into the shared canvas. The stage stops at **Your turn**.
5. In the labelled controls choose **From: Guest operating system**, **Relationship: connects**, **To: Consumer · IaaS**, then **Save relationship**. You can also select diagram nodes and use the existing drag, port or keyboard controls. Arrow controls move permitted nodes. The text version provides the same relationships.
6. Optionally write an annotation and save it. Try Undo/Redo before commitment.
7. Select **Use this work for the reviewed practice task**. Explain the relationship in **Your answer**, then **Submit answer**. The private evaluator checks the saved relationship. The explanation remains recorded; this bounded relation check does not qualify the prose reasoning.
8. Select **Work on this with Petros** again. Expect less support. After its step, **Request a fresh reviewed check** honestly reports unavailable in this demo release. The integration tests also exercise a release containing an actually eligible transfer family.

## Cloud Student B — calculation repair

1. Open **http://127.0.0.1:4943/demo/cloud-b?fresh=1** in another browser profile, or after finishing Student A. It belongs to a different synthetic student.
2. Choose **Consumer**, enter **48** and **7**, then submit.
3. Select **Work on this with Petros**. Expect **Check the method**, not the responsibility diagram. Reveal the steps. The checked equations show the source method, while the editable value preserves the student's actual **7**.
4. Change **Whole VM capacity** to **6** and select its **Save step** control. Use the practice-task button, explain the units and submit. Both the saved available-memory value and capacity are checked.
5. To change the error, start fresh, choose Consumer and enter **47** and **9**. The subtraction step should receive the focus. Correct and save both values before submitting. A correct final answer with a wrong available-memory step must not satisfy both criteria.
6. Swap A/B's answers in fresh sessions. The strategy must follow the evaluated work, not the synthetic student's label.

## English — evidence and warrant

1. Open **http://127.0.0.1:4943/demo/english?fresh=1**.
2. Select the survey observation **84 of 120 learners preferred later access**. Explain what it supports and an assumption or alternative reading. Submit.
3. Expect **Teacher review needed** for interpretation. Select **Work on this with Petros** and reveal **Look more closely**. The exact extracted claim and survey passages appear with the argument representation.
4. Connect **Evidence · survey passage** to **Claim · inspect the quoted source** using **supports**. Annotate the warrant or an alternative reading. Save the edits, use the reviewed practice task and submit an explanation.
5. Qualitative interpretation must remain pending review. It must not become correct merely because the answer is long or contains keywords.
6. Try **All residents support a change** on a fresh initial task. The bounded factual criterion changes the action to evidence/warrant inspection, while interpretation still needs review.

## Experiments, graphs and processes

After a Cloud correction and the less-supported follow-up, select **Explore a bounded experiment**. Reveal its accepted step. Enter a prediction, run the memory model, change total memory from **64** to **80**, and run again. Capacity should change from **6** to **8** under the stated uniform-memory assumptions. These are observations, not mastery evidence.

Select **Inspect a process trace**. Inspect the finite, inert subtract/divide states. Nothing executes student or model code. Select **Compare a graph and table** to inspect a registered constant-rate example and equivalent numeric data. Each plotted point is checked against the bounded rate kernel.

## Interrupt, recover and inspect sources

Use **Pause lesson** midway through a construction. Reload, then **Continue learning**. Already accepted elements must remain, and the next step must continue from the saved prefix. Opening Ask or learning preferences interrupts presentation. Ask provides an explicitly labelled reviewed-source reread; no live semantic tutor is claimed. Close with Escape to return. Independent issued tasks block answer-revealing help and source replay.

The character should refer only to current visible targets, yield while you work and stay in page flow during action work. It must not cover inputs. No voice, articulated handwriting or advanced M6 artwork is enabled.

## Mobile, keyboard and reduced motion

Open **http://127.0.0.1:4943/demo/mobile?fresh=1** at **360px**, then also inspect **390, 768, 1280 and 1440px**. Complete an equation, not just the initial screen. Use Tab/Shift+Tab, native selects and buttons. For a diagram, every relationship can be created with labelled controls without dragging.

Open **http://127.0.0.1:4943/demo/reduced?fresh=1**. In **Learning preferences**, enable **Reduce motion** and **Text-only presentation**. The same committed work and evaluation must remain available. Physical phone keyboards, browser zoom, screen-reader use and educational suitability still need human review.

## Restart safely if stopped

Use Node **24.21.0** and the existing private PostgreSQL 17 tools. Do not load the workspace `.env`, pass a configured database URL, run the migration installer, or use real student accounts. The launcher refuses configured DB/PG target variables. These commands start loopback demos and apply migrations only to a newly created disposable cluster.

Terminal 1:

```sh
cd '/Volumes/Chris/Edrion Labs/apps/api'
export PATH='/Users/macbook/.local/bin:/private/tmp/verdine-pg-tools-045/Postgres.app/Contents/Versions/17/bin:/Volumes/Chris/Development/Toolchains/node-v24.21.0-darwin-arm64/bin:'"$PATH"
export PETROS_M5_EVIDENCE_DIR="/Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m5-manual-$(date -u +%Y%m%dT%H%M%SZ)"
export PETROS_M4_EVIDENCE_DIR="$PETROS_M5_EVIDENCE_DIR"
export PETROS_VERIFICATION_EVIDENCE_DIR="$PETROS_M5_EVIDENCE_DIR"
node -r ts-node/register/transpile-only -r tsconfig-paths/register scripts/serve-petros-m5.ts
```

Wait for **M5 demo API ready** before opening a student link. The PostgreSQL path is the tool installation present during this verification; if it is absent, install/locate PostgreSQL tools before launching. Do not substitute a hosted database.

Terminal 2:

```sh
cd '/Volumes/Chris/Edrion Labs/apps/student-web'
PETROS_ISOLATED_VERIFICATION=1 PETROS_M4_VERIFICATION=1 NEXT_PUBLIC_PETROS_M4_DEMO=1 NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4943 node node_modules/next/dist/bin/next dev -p 4944 -H 127.0.0.1
```

Stop these demo processes with Ctrl+C. The API closes its private queue and database. The recordings remain saved even after the demo stops.

To reopen the saved recording gallery, run this in a third terminal:

```sh
python3 -m http.server 4945 --bind 127.0.0.1 --directory '/Volumes/Chris/Edrion Labs/docs/verification/petros-v2/m5-20261019T052910Z'
```

Then open **http://127.0.0.1:4945/review.html**. The gallery itself does not need the demo database.

## Human acceptance

Review the two different Cloud paths, actual edits, feedback, English uncertainty, interruption, mobile layout and nonvisual alternatives. Record approval or specific corrections. M5 requires your explicit approval of adaptive behavior and visual experience before any M6 work. Independent academic, genuine-provider and production gates remain separate.
