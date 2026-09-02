# Petros mentor

The portal now mounts one mentor outside page content. Its character and next-step guidance are available without opening a conversation. Routine suggestions stay compact; urgent deadlines can expand the guidance unless the student is typing, has paused Petros, or has disabled proactive check-ins. Exams in progress, payments, and finite learning sessions retain their existing protected surfaces.

## Decisions and continuity

`PetrosMentorService` gathers authorised outstanding work, upcoming exams, review, planner items, current learning evidence, session history, and teacher materials. The deterministic engine ranks deadline risk first, then published points, observed learning gaps and prerequisite links. A new assignment does not outrank tomorrow’s exam just because it was recently published. Already-submitted assignments, including late submissions, are excluded.

Time plans are bounded by the minutes the student supplies, including breaks. Low-energy plans use focus blocks of at most fifteen minutes. Multi-day availability is supported; duplicate and past dates are rejected. Remaining work is re-read on navigation, manual refresh and periodic checks, so submitted work drops out. Deferred work stays outstanding; postponement lasts thirty minutes, and a daily skip expires at the institution’s midnight. Critical deadlines override deferral. Opening a task never marks it complete.

The account stores guidance level, animation preference, temporary pause, tour completion, supplied availability, and the last eighty started/skipped/postponed recommendations. JSON updates preserve unrelated preference fields. The API validates feedback against the student’s own current records. Conversation receives the same global decision, even for a motivation or break question; verified priorities and navigation remain available if conversational generation fails.

## Spatial guidance

Pages expose stable `data-petros-target` anchors. Entity anchors use `entity:<type>:<id>`; navigation uses `nav:<path>` and `directory:<path>`. `PetrosAskButton` publishes the exact entity anchor without changing the rule that conversational selection must be explicit. The targeting helper compares literal identifiers; model text is never executed as a selector or DOM action.

Guidance can highlight an item, scroll it into view and place the character beside it. When a conversation opens, Petros docks in a dedicated header slot, away from reply actions. The panel has an independently scrollable reply and a pinned multiline composer, plus expand, close and Escape controls. At desktop widths of 1200px and above the page reserves room beside the panel. Phones use a bounded sheet with a full-height expansion option. Layout measures the usable viewport, including scrollbar space. Closing also cancels recording, pending audio and walkthrough navigation.

Speech is off by default. Read aloud and voice previews are explicit actions; students can opt into automatic replies, choose Cedar or Marin, and select their transcription language (English by default). These choices are stored per student on the current device. Modern OpenAI TTS uses a calm, natural delivery; legacy routes retain a compatible voice. Recordings become editable drafts rather than automatically submitted messages. Voice synthesis and transcription continue through the governed gateway without caching sensitive audio.

The browser audio element is the single playback clock. Its `play`, `timeupdate`, `ended`, and `error` events drive the observable `preparing`/`speaking`/`idle` state. While it is speaking, the transcript is split into sentence lines and duration-weighted words; the active line and word follow `currentTime / duration`, and the character moves beside that active line. The character alternates its closed- and open-mouth frames only while that same audio state is `speaking`. Stopping, ending, failing, hiding the page, or starting microphone capture returns the mouth to `rest`. This is audio-duration synchronization rather than phoneme/viseme alignment because the current governed speech response returns audio and transcript, but no timed phonemes.

### Lip-sync smoke test

1. Open any student page, open Petros, choose **Settings**, and press **Preview voice**.
2. At the first audible word, verify the character mouth starts alternating and the Petros root has `data-voice-phase="speaking"`; the current word and sentence line should be highlighted.
3. Press **Stop preview** midway. Audio and mouth movement must stop together, and the root must read `data-voice-phase="idle"` and `data-mouth="rest"`.
4. Play the preview again and let it finish. The final audio event must produce the same idle/rest state without another click.
5. Repeat once at a slower or faster configured voice speed. Highlighting must still cross the full transcript because it uses the actual audio duration.

The deterministic automated check is `pnpm exec vitest run src/components/petros/use-petros-voice.spec.tsx src/components/petros/petros-mentor.spec.tsx` from `apps/student-web`. It verifies playback start, time progress, line/word selection, natural end, forced stop, mouth state, and stale-event safety.

## Teaching planning and document efficiency

Every contextual teaching door now resolves a planning contract before it creates a learning session. The preview asks the student to choose the first topic, current purpose (exam preparation, understanding, revisiting a weak topic, or quick review), available time, and an optional starting doubt. The selected values are validated against the resolved source and transferred into the shared adaptive session engine. A published exam or assignment date appears as teacher-schedule context and changes the suggested priority; it is not inferred from conversation text.

Natural-language teaching requests use the same door. A companion `session.preview_and_start` suggestion is converted into an actionable `session_offer` block with an owner-resolved source, question, route and duration. The UI renders **Plan this lesson**, which opens the planning preview; it no longer renders a non-interactive “I can start a session” message or starts a session directly from a generic companion confirmation.

Uploaded documents use `petros_document_lesson_outlines`. Extraction still belongs to the existing knowledge-item ingestion pipeline, but Petros structures the authorized pages into at most twelve source-linked lesson topics once per owner, document version, and page fingerprint. Later previews reuse that outline, and session creation passes only the selected topic's page-range citations into the teaching loop. Changing the document version or an extracted page timestamp invalidates both the preview and its cached outline.

The character exposes `idle`, `listening`, `thinking`, `teaching`, and `answering-doubt` states. CSS-driven pose and size changes keep the persistent agent lightweight; the open/closed mouth cycle follows active audio, while teaching and doubt states use bounded gesture loops. Phoneme-level viseme sync is intentionally not claimed because the governed speech route does not return timed viseme data.

Active teaching sessions register their question handler with `usePetrosPage`. Questions from the companion therefore use the existing session question workflow rather than the global portal planner. Unrelated portal replies and priorities are suppressed while teaching.

They also register a visible-only narration sequence. Petros teaches one semantic segment at a time and points to that segment's exact page anchor. The browser audio clock highlights the current sentence and word in both Petros's speech transcript and the matching lesson-page text. A learner interruption captures the active segment and word index, clears the teaching highlight, and stops the narration. The server validates the segment against the current block, answers in that immediate context, and records the return label. Follow-up questions remain on the same pause, and confirmation rejoins every follow-up detour before audio resumes at the captured word. Petros no longer restarts a flattened block summary.

Uploaded-document citations retain their extracted excerpt in the visible session. Source excerpts are independent teaching targets, so Petros can point at the selected page passage before explaining it. Hidden reveals and locked explanatory content are not included in narration until they are visible.

The implementation comparison with the earlier Edrion Petros is recorded in `docs/PETROS-EDRION-REFERENCE-COMPARISON.md`.

Flows include Explore → Library → saved study work, the portal tour, assignment brief/submission guidance, homework questions, Progress recommendations and source-linked reading. Other authorised modules use their navigation and page anchors. To extend a module, register its real entities with `usePetrosPage`, render exact entity anchors, and keep server context resolution authoritative.

## Evidence limits

Tracked learning topics are not necessarily an institution’s complete syllabus. Stale Progress evidence is identified and does not support weakness or prerequisite weighting until refreshed. Resource matching uses published titles/subjects and measured extracted page counts; it does not claim two resources cover identical content or predict completion time. Session timers do not prove uninterrupted attention, and abandoned sessions do not trigger claims of days spent studying. The character uses illustrated idle, listening, thinking, talking and directional pointing states, respecting reduced-motion preferences.

The mentor does not submit coursework, answer an active exam, change marks, or create notification delivery infrastructure. Existing academic notifications remain independent of its mute controls.

## Storage and validation

Migration `0205_petros_mentor_state.sql` adds account-scoped JSON state to the existing companion preferences table. Migration `0207_petros_document_lesson_outlines.sql` adds the owner-private, versioned document outline cache. Other environments must run their normal migration process.

Automated coverage includes priority ordering, critical deadlines, deferral expiry, local dates, time budgets and breaks, stale/partial records, completion refresh, feedback ownership, visible target selection, lesson-page sentence/word synchronization, exact interruption resume, safe gutter placement, passive behaviour during typing, and guided navigation. Existing Progress, Explore favourites, session and conversation tests remain part of the student portal suite.
