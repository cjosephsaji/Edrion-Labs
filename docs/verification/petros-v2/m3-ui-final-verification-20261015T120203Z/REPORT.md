# Institutional Petros Learn: final M3 UI verification

Completed 15 October 2026. Existing design retained. No M4 implementation, deployment, migration, live AI call, student publication or historical evidence overwrite. Local servers remain available on loopback ports 4923 (fixture API) and 4924 (institutional web).

Necessary corrections: read-only badge beside activity titles plus an explanation above response examples; direct objective preview links and same-page step-link synchronization with unsaved-wording protection; consistent requested-corrections and withdrawn-lesson copy; M3 request-changes persistence compatible with the existing binary database approval gate. The exact requested-change decision remains in the immutable receipt.

Cloud objective 1 classifies consumer/provider responsibilities using actual IaaS/PaaS/SaaS table cells. Cloud objective 2 compares logical resources with physical hardware and cites the virtual-machine CPU/memory passage. English asks for the author’s claim, evidence and their connection, and separately asks what the survey supports and which assumption needs checking. No subject-content dispatch or fixture text was added to the UI.

No unnecessary technical IDs appeared in the checked ordinary teacher screens. Exact source provenance remains in collapsed detail disclosures.

All requested workflow states were exercised with real M3 services and restricted App-role disposable PostgreSQL: saved/reloaded, submitted/reloaded, independent qualified change request, correction/new revision, resubmission, blocked release and denied private-content access. Mobile Chromium at 360×844 and 390×844 covered both subjects, material selection, all four steps, objective editing/save/cancel, menus, navigation with unsaved wording, previews, source/activity/review drawers, focus trapping, Escape and focus/scroll restoration.

Validation: 820 distinct automated tests passed after the documented targeted reruns; 169 main browser checks plus 4 final style checks passed; API and institutional-web TypeScript checks passed. The final main browser pass had zero runtime errors and zero external browser requests. [Detailed validation](validation-summary.json).

| Suite | Final outcome |
|---|---|
| Institutional UI | 32 passed |
| M3 service, gateway, proposals, private review | 84 passed across final per-file runs |
| M1/assignment/document authority | 126 passed, including focused retry of one PDF monitor failure |
| Schemas | 578 passed |
| Browser | 169 main + 4 additional checks |
| TypeScript | API and institutional web passed |

The original request-changes failure, one incorrect new private-release test assumption, the PDF worker monitor failure and the transitional sidebar geometry check are retained in their original run folders/logs. The PDF failure passed a focused rerun without a code change. A final same-page fragment issue found during capture was corrected and covered by the completed UI suite and successful supplementary captures.

Historical preservation: 4,913 existing artifacts are byte-identical. One already-running historical development log appended HMR/request output; its original 3,336 bytes still match the captured starting hash exactly. Nothing was truncated or overwritten. [Audit](historical-preservation-final.json).

Exact local URLs (mobile views use these same responsive routes at the stated viewport widths):

- Second Cloud activity: http://127.0.0.1:4924/teaching/6ed2a8c0-6a7f-45cf-a2fc-ddbd79ee989d/fee2b724-1412-49ba-9da7-38e51d080ae5?objective=2#petros-lessons-preview
- English activity: http://127.0.0.1:4924/teaching/6ed2a8c0-6a7f-45cf-a2fc-ddbd79ee989d/d48a4919-9b93-4da3-8d57-ce007b1a8df0?objective=1#petros-lessons-preview
- Save & Submit: http://127.0.0.1:4924/teaching/6ed2a8c0-6a7f-45cf-a2fc-ddbd79ee989d/fee2b724-1412-49ba-9da7-38e51d080ae5?objective=2#petros-lessons-submit
- Cloud objective editing: http://127.0.0.1:4924/teaching/6ed2a8c0-6a7f-45cf-a2fc-ddbd79ee989d/fee2b724-1412-49ba-9da7-38e51d080ae5?objective=2#petros-lessons-review
- English objective editing: http://127.0.0.1:4924/teaching/6ed2a8c0-6a7f-45cf-a2fc-ddbd79ee989d/d48a4919-9b93-4da3-8d57-ce007b1a8df0?objective=1#petros-lessons-review
- Independent reviewer handoff: http://127.0.0.1:4923/demo/reviewer

Primary screenshots:

| View | Screenshot |
|---|---|
| Second Cloud activity | [cloud-second-activity-desktop.png](browser/2026-10-15T12-17-29.628Z/cloud-second-activity-desktop.png) |
| English activity | [english-activity-desktop.png](browser/2026-10-15T12-17-29.628Z/english-activity-desktop.png) |
| Save & Submit | [save-submit-desktop.png](browser/2026-10-15T12-17-29.628Z/save-submit-desktop.png) |
| Cloud preview at 360px | [cloud-activity-360px.png](browser/2026-10-15T12-17-29.628Z/cloud-activity-360px.png) |
| English preview at 390px | [english-activity-390px.png](browser/2026-10-15T12-17-29.628Z/english-activity-390px.png) |
| Changes required | [changes-required-desktop.png](browser/2026-10-15T12-17-29.628Z/changes-required-desktop.png) |
| Blocked release details | [blocked-release-details-desktop.png](browser/2026-10-15T12-17-29.628Z/blocked-release-details-desktop.png) |

[Full screenshot gallery](screenshots.html) includes 55 viewport captures and 6 full activity-region captures, covering 360px and 390px in both subjects. Source, activity and review drawers are opened by their corresponding UI buttons; their open state does not have a separate route.

Remaining issues: no blocking issue found in the requested M3 UI scope. Source/academic review and student availability restrictions remain active, including partial Cloud source coverage. These are controlled engineering fixtures, not completed academic approval or live AI generation. Mobile checks use Chromium viewport emulation; no physical-device or human screen-reader study was performed.

[Task-only diff against starting files](task-changes.diff).
