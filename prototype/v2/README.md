# Petros V2 — implemented prototype

Current demo configuration: the regular tutor uses prepared questions and live simulations; AI and the 3D world are paused. YC reviewers sign in with the dedicated shared username/password account. See [YC_PREVIEW_SETUP.md](YC_PREVIEW_SETUP.md) for Netlify settings and the credential-generation workflow. Private credential files are Git-ignored and must be imported separately into hosting.

Isolated Next.js app and reusable route component. Development stays in `prototype/v2/`; the original Edrion apps, PDFs, academic APIs and uncommitted prototype changes are retained. The independent Claude review was not present in the supplied archive; `CODEX_BUILD_NOW.md` supplies the approved implementation decisions. Starter numerical modules were tested before adaptation; their rocket impact timestamp was corrected.

Run from this directory with Node 22–24:

```sh
npm ci --ignore-scripts --workspaces=false
npm run dev
```

Open http://127.0.0.1:3022/prototype. The explicit development launcher imports only `OPENAI_API_KEY` and V2 model overrides from the repository root `.env`, if present. It does not import academic/database configuration. A local `.env.local` can override Next.js environment settings. Production never uses this launcher.

All five models execute real calculations. Neural training is a one-example tanh network; attention uses illustrative deterministic vectors with Q=K=V; rocket flight has no attitude or drag; IDM traffic is one lane with numerical safety clamps; relativity is inertial special relativity. Scientific limits also appear beside each model.

The AI teacher uses three Responses calls: plan bounded deterministic simulation tools, execute them, then narrate actual observations with typed semantic scene actions. A scientific review checks the generated explanations; a further call may repair invalid scene actions. Rocket mass scaling is a deterministic tool, so doubling total mass includes remaining fuel correctly. Failed calls preserve the previous committed scene. This is genuine API teaching, with no scripted fallback advertised as AI. Offline mode keeps local numerical experiments available and labels AI unavailability.

Click an object to point at it. DOM/SVG bounds and camera-projected 3D object boxes ground the pointer. No screenshot capture or vision guessing runs by default. Vision fallback for references outside the app is not implemented. The original Petros poses crossfade as a transitional presence; no rigged character animation is claimed.

Connect voice, then tap Talk or hold V in a focused tab outside text fields. The browser requests a short-lived Realtime client secret, opens WebRTC, delegates teaching to the backend, and plays verified beats. Each next visual waits for the provider's audio-buffer completion event. Text mode uses explicit Continue actions for multiple beats. Stop cancels requests, queued narration, audio and continuous stepping, preserving committed state. The voice is AI-generated. Browser storage retains per-topic experiments and Classic/World mode; export includes events and state hashes. No timer or button infers mastery.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run test:browser
npm run test:ai
npm run test:voice
npm run test:voice:all # generates test speech; consumes live API quota
npm run test:production
npm run test:layouts # replays the saved genuine AI scenes
npm run test:visual-regression # compares ten desktop/mobile references
```

Browser tests use an installed Chromium executable (set `PETROS_BROWSER` if needed). `test:ai` and `test:voice` consume live provider quota. Evidence JSON and desktop/mobile screenshots are in `evidence/`. Voice test evidence distinguishes synthetic microphone input, real provider audio, and untested human speech/hardware conditions. See `feature-status.json` for current evidence and incomplete acceptance items.

## Vercel

Create an independent Vercel project with **Root Directory `prototype/v2`** and Node 22 or 24. Its own npm lockfile and `vercel.json` install and build this app without the production monorepo build. Set `OPENAI_API_KEY`, optional model overrides, `PETROS_V2_ACCESS_SECRET` (32+ characters), and both Upstash REST variables as server-only environment values. Deploy with `vercel --cwd prototype/v2` from the repository root after signing in. No actual deployment is claimed until a deployed URL has been verified.

Access uses an expiring HMAC-signed HttpOnly cookie scoped to `/prototype`. State-changing APIs check same-origin requests. Body size, simulation durations, command counts, provider timeouts and output lengths are bounded. Production requires shared Redis usage counters: 40 teaching requests/hour and 3 voice sessions/hour per signed visitor, plus unlock throttling. Each call limits output tokens and each voice session has a 5-minute client limit. A browser-held Realtime secret cannot provide a hard adversarial provider-spend cap; use a dedicated OpenAI project with provider-enforced spend limits. Server-side Realtime call teardown/sideband enforcement is still outstanding.

The standalone project pins Next.js 16.4.3, leaving the existing academic apps' dependency versions unchanged. The standalone app serves `/prototype` and keeps the existing academic app’s `/prototype` route available independently.

## Verified local evidence

All five live AI topic suites passed unexpected parameter questions, actual tool mutations, incorrect-answer diagnosis, changed representations, fresh transfer questions and why followups. The original prototype suite still passes 187 tests; V2 passes 75 unit/reference/security/voice-continuation/quantity tests. Production build, signed authentication, cross-origin rejection, missing-budget fail-closed behavior and a 25-file browser-bundle secret scan passed. No production app source was changed by this build.

The 4× CPU-throttled local development run measured 1,145 ms to an interactive surface, 126 ms for a traffic worker step and paint, and 16.7 ms median / 16.8 ms p95 frame intervals over 89 frames. These are local synthetic measurements, not physical low-end-device results.

All five generated spoken questions also passed the real browser-microphone → WebRTC → transcription → teacher-tool → simulation → provider-audio loop, including interruption. The voice provider retains unfinished requests across a spoken continuation and forgets them on explicit topic navigation; two focused regression tests cover that behavior. No human microphone/accent/noise acceptance or Vercel deployment is claimed.

The final desktop/mobile scene captures pass semantic-label clipping checks and ten pixel comparisons against the captured local reference images. `feature-status.json` distinguishes these local checks from external design approval and deployment.

Final mass-comparison regression: after doubling total mass, the heavy rocket impacted at 4.99 s; the pre-question reference run remained at 51.42 m after 6 s. Quantity guards reject a total/dry-mass label mixup before narration is committed. Range controls accept the actual computed mass without snapping it to an inconsistent value.
