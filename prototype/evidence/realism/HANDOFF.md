# Imported room — visual review handoff

29 October 2026. Working local route: **http://127.0.0.1:3021/prototype**. Select AI Module 3 → Enter Petros World → Find my module → Retrieve this book. The server is running on loopback; this has not been publicly deployed.

## Review status

The imported reference room is ready for owner visual review. This is the requested Section 10 gate, not a claim that the full realistic-scaffold request is complete. The source instruction says: **“Do not proceed to polishing the other lessons until this room passes visual review.”** Its next step is: **“Once the room is approved, integrate the finished construction scaffold…”** See [the supplied request](../../ASSET_QUALITY_REQUEST.md).

## Actual browser evidence

- [Wide interior arrival](01-arrival.png)
- [Close library](02-library.png)
- [Whiteboard teaching](03-teaching.png)
- [Continuous native browser recording](reference-room.webm): 51.16 seconds, 1920 × 1080, VP8/WebM, 25 fps, silent. It shows entry, four direct book selections, retrieval, automatic minimax teaching, a student prediction, an explicitly prepared interruption, the lighter graphics setting and Classic resume. No offline renders, trims, speed changes, compositing or resized footage. Earlier failed/intermediate captures are retained under `iterations/` and are not the acceptance evidence. Native viewport dimensions are asserted before recording. An extracted frame was inspected to confirm the footer and full application are present.

## Implemented

- Actual CC0 architectural shell with authored floor, window frames, ceiling, beams, trim and pipework from Christophe Seux's Classroom. The removed corridor partition and its attached trim no longer cross Petros.
- James Ray Cock's pine display bookcases, John Malcolm's modeled encyclopedia bindings and covers, horizontal stacks and individually selectable uploaded module books. The four course IDs remain associated with the real source lessons. Source retrieval moves the actual imported book mesh.
- Finished desk, chair, wooden experiment table, task lamp, cabinet and potted plants with authored PBR image maps. Original materials are retained rather than recoloring the room sage.
- Authored physical board fixture around the existing generated, interactive teaching canvas. The programmatic board and cover labels use the same self-hosted Outfit family as Classic.
- HDR environment, glass, warm task/shelf light, window illumination, contact shadows and ACES tone mapping. Camera views frame the room, close library and readable teaching board. Petros's complete illustrated body fits beside the board.
- Original static Petros sprites; floor alignment accounts for the original artwork's transparent bottom margin. Station changes remain fades, without invented walking or limb animation.
- Shared lesson state, all four module books and two prepared open topics. A lighter graphics option caps DPR at 1 and disables shadows; smaller or low-core devices select it automatically. The detailed option caps DPR at 1.5.
- Private allowlisted asset delivery behind the existing showcase access gate. Content-hashed asset URLs prevent stale browser models. Source archives, metadata and PDFs are not exposed by the asset endpoint. World remains lazy-loaded outside Classic.

## Observed performance

Measured in Brave using the actual 1920 × 1080 application, native DPR 1, on **Apple M4 / ANGLE Metal**. The browser context starts without cached scene assets; the local development server is already compiled. Results are observations on this machine, not a device-wide guarantee.

- Scene asset bodies: **11,382,307 bytes (10.86 MiB)** across 12 successful requests. These are the models/HDRIs, excluding application JS, fonts and original Petros PNGs.
- Enter click through loaded-room/portal completion: **3.92 seconds**. This includes the transition. An independently delayed architectural GLB kept the portal in Loading until released.
- Approximately **60 FPS** during the measured camera transitions. Native recording encoding is separately 25 fps.
- Shared geometry buffers: **5.31 MiB**; placed scene geometry: **697,362 triangles**.
- Conservative material-map residency estimate: **363.0 MiB**. This assumes RGBA8 and mipmaps, may overcount shared texture sources, and excludes PMREM, shadows, framebuffers/MSAA and driver overhead. It is not measured GPU allocation. Color maps retain up to 2K; normal and packed maps use 1K.

| View | Draw calls | Rendered triangles incl. passes | Observed JS heap | Camera FPS samples |
| --- | ---: | ---: | ---: | ---: |
| Arrival | 647 | 1,225,152 | 116.4 MiB | 60.5–60.5 |
| Library | 149 | 206,794 | 111.0 MiB | 60.5–61.1 |
| Teaching | 315 | 632,172 | 121.3 MiB | 60.5–61.1 |

Draw calls include the shadow/transmission passes. Practice reserves part of the 1080p application for readable captions and student responses; the scene buffer dimensions are recorded in [verification.json](verification.json). Other raw evidence: [layout results](layout-results.json), [delayed loading](loading-results.json), [source integrity](source-integrity.json).

## Validation

- **50/50 unit tests passed**, including four new runtime-asset access tests: actual GLB delivery, source/traversal denial, disabled feature denial and public-host denial.
- **128 browser checkpoints passed**: 64 in Classic and 64 in World. AI3/AI4/EHS3/EHS5 each retain twelve checks; prepared AI/time lessons retain eight each. [Full regression results](regression/browser-results.json), [trace](regression/full-browser-trace.zip).
- **Six final camera/layout checks passed**: 1920 × 1080, 1440 × 900, 1366 × 768, 1024 × 768, 768 × 1024 and 390 × 844. No board bounds errors or horizontal overflow. Small viewports use lighter graphics.
- **16 reference-scene checks passed**, including real mesh picking for all four module books, automatic teaching → prediction, prepared interruption → exact checkpoint, graphics changes → same checkpoint and answered World checkpoint → Classic.
- Delayed imported-asset loading: **4/4 checks passed**. No teleport before the architecture was ready.
- Student-web TypeScript and isolated Next production build passed. Prototype route: 37.4 kB / 126 kB first-load JS in this build; the 3D scene remains a separate dynamic import.
- Four source PDF hashes still match. No browser JavaScript errors or production mutation requests in the observed runs. No new status entries outside `prototype/` compared with the asset-task baseline.

Commands and complete preparation steps are in [the asset README](../../assets/realism/README.md). Test logs: [unit](unit-tests.txt), [type check](tsc.txt), [build](build.txt), [reference](verification-run.txt), [regression](regression-run.txt).

## Assets and reproducibility

Twelve runtime files are mounted: ten model GLBs and two HDRIs. Two extra model candidates were downloaded and are **not mounted**. [Readable asset inventory](../../assets/realism/ASSETS.md) lists every creator, source, triangle count, compressed size, texture resolution and integration status. [Machine-readable register](../../assets/realism/asset-register.json) includes original/converted formats, license/attribution, placement and SHA256. Poly Haven assets are [CC0](https://polyhaven.com/license); Blender's [official demo page](https://www.blender.org/download/demo-files/) labels Classroom CC0. No attribution is required, but credits are retained.

The preparation uses pinned glTF Transform 4.5.1, Meshopt 1.3.0, Sharp 0.35.5 and portable Blender 4.5.9 LTS. Original source files remain under `assets/realism/source/`. The Classroom ZIP SHA256 is `0f0ecc58d45f12b2f4272a53e2d8e69135518e16e956b118f10c20d8dcfdf5e6`. Older Cycles shaders were adapted to glTF PBR; the room is not a pixel-identical copy of the original offline render. The acceptance evidence is the live browser views above.

## Exact changes

All changes for this asset task are inside root `prototype/`; **no new edits outside it**. Existing unrelated workspace changes were preserved.

Modified:
- `teaching/server.ts`
- `world/scene.tsx`
- `world/spatial-teaching.tsx`
- `world/board-surface.tsx`
- `world/room.tsx`
- `world/world.module.css`
- `README.md`

Added principal implementation/document files:
- `world/asset-interior.tsx`
- `world/asset-budget.ts`
- `assets/realism/runtime-manifest.ts`
- `assets/realism/runtime-versions.json`
- `assets/realism/asset-register.json`
- `assets/realism/ASSETS.md`
- `assets/realism/README.md`
- `ASSET_QUALITY_REQUEST.md`

Added preparation scripts/dependency manifests under `tools/`, runtime/source/metadata assets under `assets/realism/`, `tests/realism-*`, and this evidence directory. **[FILES.json](FILES.json) enumerates the exact paths**, including raw source cache files and original Petros asset hashes. Local preparation `node_modules` is excluded from that list and ignored. The historical procedural `world/interior.tsx` is unimported; the finished room uses `world/asset-interior.tsx`.

## Pending and limitations

- **Realistic construction scaffold is pending room approval.** No finished licensed scaffold has been acquired or integrated. The visible EHS scaffold still uses the prior procedural geometry and numbered interaction markers; its five existing hazards and safer toggle are preserved. It must not be presented as the completed asset replacement. River and other experiment illustrations remain the prior teaching implementations.
- Room quality is awaiting owner visual review. Once approved, acquire the scaffold, map the five hazard IDs to actual components, implement unsafe/safer geometry changes, remove the numbered blocks and capture the experiment view before broader lesson polish.
- Petros remains the original 2D static artwork. Walking, sitting, grabbing, blinking, lip sync and articulated gestures require separately approved art/rig assets.
- General live questions and arbitrary topic generation remain unavailable in this isolated showcase. Existing tutor APIs persist production conversations/academic state and are not called. Prepared source-linked interruptions are explicitly labeled. Voice is unavailable; the recording is silent and text-led.
- Lesson progress is browser-memory only. Mode changes and graphics changes preserve it; reload clears it. Public deployment and enrolled-student production authentication were not exercised.
