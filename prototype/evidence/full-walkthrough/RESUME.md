# Active recording task

User requested one long, slow, continuous real screen recording covering all uploaded modules in Classic and Petros World, with answers, questions, feedback and activities. No edits to the teaching app are being made.

The real capture is running with:

`pnpm --filter @edrion/petros-showcase exec tsx tests/record-complete-walkthrough.mts`

Active unified exec session at restart: **48910**. Do not terminate it unless the user asks to stop. It is expected to take around an hour at its readable pace. It uses one native 1920 × 1080 browser viewport/context/video, 25 fps, no audio. There are no cuts or speed changes. Slow typing and reading pauses are deliberate. All work is under prototype/.

Live progress: `capture/progress.json` and `capture-run.txt`. Final result: `capture/recording.json`. If recording.json appears early, check `failure` immediately. Successful final result must have `passed:true`, 96 completed checkpoints and 8 module sessions (4 Classic + 4 World). First take failed at a long typing timeout; it is archived under `iterations/take-1-typing-timeout`. The typing call now has an explicit 90-second timeout.

Preflight found that the Classic excavation details are already open at Q11 and the World recap speech can overlap its next-book button. The script uses the actual summary/open state and Dismiss World speech control respectively. It never forces clicks through overlays or injects academic state.

Provide commentary progress roughly every minute while waiting. Do not change product files or interrupt the recording. User may steer the ongoing task; respond briefly and continue unless explicitly stopped.

After successful completion:

1. Run `node prototype/tools/index-complete-walkthrough.mjs` to create WATCH.html, README.md and chapters.vtt using observed timestamps.
2. Verify the finalized video via the Playwright FFmpeg binary `/Volumes/Chris/Development/Caches/playwright/ffmpeg-1011/ffmpeg-mac`. This build decodes VP8 and extracts PNGs; it cannot encode MP4/H264. Deliver the original WebM, not a fabricated conversion.
3. Inspect sample frames from Classic and World, including lower viewport/footer. Native `viewport:null` plus `--window-size=1920,1161` avoids the padding seen in viewport-emulated captures.
4. Verify 8 modules, 96 actual UI answers, zero browser errors/production mutations and the actual duration. Make a concise final response with the single recording and timestamp guide/player links.

Expected canonical file: `/Volumes/Chris/Edrion Labs/prototype/evidence/full-walkthrough/capture/petros-complete-classic-and-world.webm`.

Important guide points: teaching steps differ from checkpoint count; World AI3 first asks Q07 then returns to unanswered questions; Classic C=(1,4) yields four evaluated leaves while World C=(4,1) yields five, both root 3/A. Classic live questions are unavailable, while World retrieves labelled prepared source-linked explanations. Free prose is recorded without automatic grading. The scaffold remains the old model pending room approval. Keep these actual limitations visible.
