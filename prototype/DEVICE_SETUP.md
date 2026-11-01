# Run Petros Showcase on another computer

The prototype runs inside the repository's student web application. The computer can use its own clone path; it does not need `/Volumes/Chris/Edrion Labs`.

## Code and prerequisites

1. Clone/pull `main` from `https://github.com/cjosephsaji/Edrion-Labs.git` after the sync is pushed. The collaborator needs repository access if it is private.
2. Install Node **24.21.x or a newer Node 24** (see `.nvmrc`) and pnpm **11.1.2**, matching the repository package manager. Use Node 24 rather than an older global Node.
3. From the repository root, run `pnpm install --frozen-lockfile --ignore-scripts`. Install the whole workspace: PDF upload uses the PDF.js dependency declared by `apps/api` even when the API server is not running.

The optimized 3D GLB/HDR files in `prototype/assets/realism/runtime/`, runtime manifests, font configuration, prepared lessons and original Petros artwork under `apps/student-web/public/petros/states/` are part of the code handoff. Do not copy `node_modules` or a `.next*` directory between devices. Neither Blender nor the original downloaded 3D authoring archives is needed to run the existing room.

## Private module pack

Obtain `petros-modules-private.zip` directly from the owner. It contains the following paths relative to the repository root:

```text
prototype/assets/source-pdfs/AI_Module_3.pdf
prototype/assets/source-pdfs/AI_Module_4.pdf
prototype/assets/source-pdfs/EHS_Module_3.pdf
prototype/assets/source-pdfs/EHS_Module_5.pdf
prototype/assets/extracted-sources.json
```

Extract **into the repository root**, retaining these paths. Do not extract inside `prototype/` (that would create an incorrect nested `prototype/prototype/` folder). These course inputs are excluded from Git and should be shared only with authorized collaborators.

If only the four original PDFs are available, place them in `prototype/assets/source-pdfs/`, then regenerate the extracted page inventory with:

```sh
pnpm --filter @edrion/petros-showcase prepare:sources
```

This verifies their SHA256 hashes against `prototype/assets/source-manifest.json`. Renaming another PDF to a module filename will not pass recognition. The source file names above must remain exact for the prepared source-reader paths.

Verify the installation:

```sh
node prototype/tools/verify-device.mjs
```

## Start on macOS or Linux

Run this from the repository root:

```sh
PETROS_SHOWCASE_ENABLED=1 PETROS_SHOWCASE_LOCAL_ONLY=1 PETROS_ISOLATED_VERIFICATION=1 pnpm --filter @edrion/student-web exec next dev --hostname 127.0.0.1 -p 3021
```

## Start on Windows PowerShell

Run this from the repository root:

```powershell
$env:PETROS_SHOWCASE_ENABLED = '1'
$env:PETROS_SHOWCASE_LOCAL_ONLY = '1'
$env:PETROS_ISOLATED_VERIFICATION = '1'
pnpm --filter @edrion/student-web exec next dev --hostname 127.0.0.1 -p 3021
```

Open **http://127.0.0.1:3021/prototype** in a recent browser. Allow initial font loading to finish. Petros World requires WebGL; Classic remains available when a device cannot render the room. The 30 October learning redesign was browser-tested on Windows with Chrome/Edge at desktop and phone viewport sizes; see [the current evidence report](evidence/learning-redesign/HANDOFF.md). Linux has not been browser-tested in this handoff.

## Environment and services

Optional new-topic generation is configured separately in [TOPIC_SETUP.md](TOPIC_SETUP.md). The API key belongs in the ignored local environment file. AI, time travel, integrals and the authored knowledge assessment work without it. A working server-side key enables structured lesson planning and contextual questions; no production database or tutor API is required.

The local showcase flags above are sufficient. The showcase does **not** require the owner's `.env`, database dump, Supabase/service-role keys, cookies, uploaded student files, Redis, or a running API server. Do not send those secrets as part of this prototype handoff.

The full Edrion portals are a separate setup: use `.env.example`, a separate local development database/Redis and the documented migrations, and obtain any required development credentials through a secure channel. Pulling the showcase does not reproduce a production database or enrollment state.

## Verification

```sh
pnpm --filter @edrion/petros-showcase test
pnpm --filter @edrion/student-web exec tsc --noEmit
```

Run TypeScript checking after any `next build` has completed; the build regenerates its type files. The current learning tests discover an installed Chromium browser, or use the executable specified by `PETROS_BROWSER`. With the showcase running, set `SHOWCASE_TEST_URL=http://127.0.0.1:3021` for this guide's port, then run `pnpm --filter @edrion/petros-showcase run verify:learning` and `run verify:learning-world`. The browser test dependency is installed with the workspace; running the product itself does not require Playwright.

The active lesson, diagram, committed responses, assistance and selected mode recover after refresh using storage scoped to this browser tab. Uploaded PDF contents/receipts are excluded from storage. If storage is unavailable, the footer reports memory-only progress. Prepared teaching and practice work locally. New topic planning and contextual questions use the optional connector in [TOPIC_SETUP.md](TOPIC_SETUP.md); its key is blank by default. TTS remains unavailable.
