import {
  PETROS_CLOSING_MOVES,
  PETROS_MOVE_TYPES,
  PETROS_PLAN_SCHEMA_VERSION,
  PETROS_RENDER_SCHEMA_VERSION,
  petrosPlanDecisionSchema,
  petrosTeachingBlockContentSchema,
  type PetrosMoveType,
  type PetrosPlanDecision,
  type PetrosSessionState,
  type PetrosTeachingBlockContent,
} from "@edrion/schemas";

export const PETROS_PLAN_SYSTEM_PROMPT = `You are PLAN inside Petros, a teaching engine rather than a chatbot.
Choose exactly one next move from the complete move vocabulary declared by the response schema.
Use only the explicit resolved topic profile, session state, observation summary, time, and capabilities supplied.
Return strict JSON. selectionPolicy must contain normalized candidate weights, exclusions, and any policy override.
studentSafeReason and decisionFactors are visible policy facts, never hidden reasoning or chain-of-thought.
Enforce two Socratic probes maximum, mathematical-plus-depth eligibility for derivation, high-density prerequisite repair after the opening explanation, sourced misconceptions, no hooks after a bad result or with little time, and capability fallback.
For the five_minute door, enforce exactly one concise explanation, one visual teaching move (or text fallback), one check, and one artifact commit; never expand automatically.
For snap_question, begin at the student-confirmed stuck point without revealing a complete solution. For handwriting, teach from the first confirmed logical break rather than replacing the solution.
Teach a new target before assessing it. The first move must explain the idea directly; questions and checks come only after that explanation, and document-led lessons should follow with a diagram when the capability is available. Composer questions become explicit route changes.
Honor institutionalDecision exactly. For outside/depth-limited syllabus decisions, stay inside the declared source boundary and give the stated legitimate next path. In guided_homework mode, never select or imply a final answer: use questions, hints, setup, prerequisite repair, critique, or process feedback.
Do not render teaching content. Do not add fields.`;

export const PETROS_RENDER_SYSTEM_PROMPT = `You are RENDER inside Petros.
Render only the already-selected teaching move as its exact typed block schema.
Keep content concise, grounded in the supplied profile and source context, accessible, and student-safe.
When learnerContext.pendingReexplanation is present, faithfully re-explain its sourceContent at the requested level. "simpler" means plain language, smaller prerequisite steps, and no loss of accuracy; "deeper" means more mechanism, nuance, and useful connections. Produce genuinely new wording rather than repeating the source block.
Diagrams are editable structured nodes and edges with a complete nonvisual description.
Question content must support commitment before reveal, but explanatory and visual teaching blocks must render immediately without forcing a preliminary answer. Do not choose a different move.
Honor institutionalDecision exactly. Guided homework may teach setup and process but must not reveal the assignment's final answer. A syllabus boundary must retain the student-safe legitimate path.
Do not add provider details, hidden reasoning, chain-of-thought, or fields outside the schema.`;

type Exclusion = { move: PetrosMoveType; reason: string };

export function deterministicPlan(
  state: PetrosSessionState,
): PetrosPlanDecision {
  const dimensions = state.resolvedTopicProfile.profile.dimensions;
  const weights = Object.fromEntries(
    PETROS_MOVE_TYPES.map((move) => [
      move,
      dimensions.moves.weights[move] ?? 0,
    ]),
  ) as Record<PetrosMoveType, number>;
  const exclusions: Exclusion[] = [];
  const used = state.priorMoves.map((move) => move.decision.selectedMoveType);
  const index = state.moves.used;
  const shortOnTime = state.time.remainingSeconds < 360;
  const fromBadResult =
    state.sessionType === "repair" ||
    state.sourceContext?.door === "result_repair" ||
    state.learnerContext.latestResultScorePercent != null;
  const fromAssistant = state.sourceContext?.door === "assistant_handoff";
  const fromSnap = state.sourceContext?.door === "snap_question";
  const fromHandwriting = state.sourceContext?.door === "handwriting";
  const fiveMinute = state.sourceContext?.door === "five_minute";
  const institution = institutionalDecision(state);
  const guidedHomework = institution?.homework?.mode === "guided_homework";
  const reexplanation = requestedReexplanation(state);
  const sessionDepth = state.learnerSnapshot?.sessionOverride?.depth;
  const inferredDepth = state.learnerSnapshot?.preference.minimumEvidenceMet
    ? state.learnerSnapshot.preference.depth
    : "neutral";
  const wantsDepth =
    sessionDepth === "deep" ||
    (sessionDepth == null &&
      (state.learnerContext.wantsDepth === true || inferredDepth === "deep")) ||
    state.observations.recent.some(
      (observation) =>
        /explain deeper|deeper explanation|depth requested/i.test(observation.summary),
    );
  const visualAvailable =
    state.topicContext.visualProviderAvailable !== false &&
    !(
      isRecord(state.topicContext.capabilities) &&
      state.topicContext.capabilities.diagram === false
    );
  let capabilityFallback: string | null = null;
  let forced: PetrosMoveType | null = null;
  let forcedReason = "";

  const exclude = (move: PetrosMoveType, reason: string) => {
    if (weights[move] > 0) exclusions.push({ move, reason });
    weights[move] = 0;
  };
  const add = (move: PetrosMoveType, amount: number) => {
    if (weights[move] > 0) weights[move] += amount;
  };
  const adjust = (move: PetrosMoveType, amount: number) => {
    if (weights[move] > 0) weights[move] = Math.max(0, weights[move] + amount);
  };

  for (const move of dimensions.moves.disallowed)
    exclude(move, "The published topic profile disallows this move.");

  const phasePattern =
    index < 2
      ? dimensions.moves.openingPattern
      : state.moves.remaining <= 2
        ? dimensions.moves.closingPattern
        : dimensions.moves.practicePattern;
  phasePattern.forEach((move, position) =>
    add(
      move,
      Math.max(
        2_000,
        12_000 - Math.abs(position - (index % phasePattern.length)) * 2_000,
      ),
    ),
  );

  if (index >= 2) {
    exclude(
      "hook",
      "Hooks are opening moves and the session is already under way.",
    );
    exclude("goal_frame", "The session goal has already been framed.");
    if (!state.observations.summarizedOutcomes.openDetours)
      exclude(
        "prerequisite_check",
        "The opening prerequisite window has passed without a new gap signal.",
      );
  }
  if (fromBadResult)
    exclude(
      "hook",
      "A result-repair session starts practically, without a cheerful hook.",
    );
  if (fromAssistant || state.sessionType === "doubt")
    exclude(
      "hook",
      "A contextual doubt continues directly from the transferred question.",
    );
  if (shortOnTime)
    exclude(
      "hook",
      "The remaining time is better used on direct teaching and practice.",
    );
  if (dimensions.mathematicalLoad === 0)
    exclude(
      "derivation",
      "The published profile marks this topic as non-mathematical.",
    );
  else if (!wantsDepth)
    exclude(
      "derivation",
      "Derivation waits for an explicit learner signal requesting depth.",
    );
  if (
    dimensions.misconceptionRichness < 2 ||
    dimensions.misconceptions.length === 0
  )
    exclude(
      "misconception_demolition",
      "No sourced, known misconception justifies demolition for this topic.",
    );
  if (!visualAvailable) {
    exclude(
      "diagram",
      "No configured diagram capability is currently available.",
    );
    capabilityFallback =
      "Diagram capability was unavailable, so PLAN selected a structured textual alternative.";
    add("layered_explanation", 5_000);
    add("story", 2_000);
  }
  if (guidedHomework) {
    exclude("worked_example", "Active related homework permits setup and feedback, not a worked final answer.");
    exclude("derivation", "Active related homework keeps the final derivation for the learner.");
    add("socratic_probe", 18_000);
    add("prerequisite_check", 12_000);
    add("predict_then_reveal", 10_000);
    add("contrast_case", 8_000);
  }

  const probeCount = used.filter((move) => move === "socratic_probe").length;
  if (probeCount >= 2) {
    exclude(
      "socratic_probe",
      "The non-negotiable two-probe Socratic cap has been reached.",
    );
    add("layered_explanation", 15_000);
  }

  if (
    dimensions.prerequisiteDensity >= 3 &&
    !used.includes("prerequisite_check")
  ) {
    forced = "prerequisite_check";
    forcedReason =
      "High prerequisite density makes the prerequisite check mandatory.";
  } else {
    const required = dimensions.moves.required.find(
      (move) => !used.includes(move) && weights[move] > 0,
    );
    if (required && index < Math.max(2, state.moves.maximum - 1)) {
      forced = required;
      forcedReason = `The published profile requires ${required.replace(/_/g, " ")}.`;
    }
  }

  if (
    index === 0 &&
    fromAssistant &&
    weights.layered_explanation > 0
  ) {
    forced = "layered_explanation";
    forcedReason =
      "The accepted contextual question needs a direct explanation before any generic framing.";
  } else if (
    index === 0 &&
    !forced &&
    state.sourceContext?.door === "uploaded_document" &&
    weights.layered_explanation > 0
  ) {
    forced = "layered_explanation";
    forcedReason =
      "The selected document page should ground the first explanation directly.";
  }

  if (state.sessionType === "revise" || state.sessionType === "repair") {
    add("recall_check", 5_000);
    add("contrast_case", 4_000);
    add("apply_to_your_world", 3_000);
    add("worked_example", 4_000);
  }
  if (state.sessionType === "revise") {
    add("recall_check", 12_000);
    add("contrast_case", 10_000);
    add("synthesis", 8_000);
    add("artifact_commit", 4_000);
    adjust("layered_explanation", -5_000);
  }
  const learner = state.learnerSnapshot;
  if (learner && !learner.neutral && !learner.stale) {
    for (const outcome of learner.moveOutcomes)
      adjust(outcome.moveType, outcome.weightAdjustmentBasisPoints * 4);
    const dominantError = learner.errors[0];
    if (dominantError?.category === "concept_gap")
      add("layered_explanation", 14_000);
    if (dominantError?.category === "procedural_method") {
      add("worked_example", 14_000);
      add("contrast_case", 9_000);
    }
    if (dominantError?.category === "arithmetic_slip") {
      add("worked_example", 8_000);
      add("recall_check", 4_000);
    }
    if (dominantError?.category === "misreading") add("contrast_case", 12_000);
    if (learner.calibration.fragileConfidence) add("recall_check", 12_000);
    const effectivePace =
      learner.sessionOverride?.pace ?? learner.preference.pace;
    const effectiveDepth =
      learner.sessionOverride?.depth ?? learner.preference.depth;
    if (effectivePace === "fast") add("predict_then_reveal", 5_000);
    if (effectivePace === "deliberate") add("layered_explanation", 5_000);
    if (effectiveDepth === "deep") add("derivation", 8_000);
    if (effectiveDepth === "concise") {
      adjust("derivation", -20_000);
      add("recall_check", 4_000);
    }
  }
  const latestAnswer = [...state.observations.recent]
    .reverse()
    .find((observation) => observation.type === "answer_submitted");
  if (latestAnswer && /\b(?:incorrect|partial)\b/i.test(latestAnswer.summary)) {
    add("layered_explanation", 7_000);
    add("worked_example", 5_000);
    if (dimensions.misconceptions.length)
      add("misconception_demolition", 6_000);
  }
  if (
    latestAnswer &&
    /\bcorrect\b/i.test(latestAnswer.summary) &&
    !/confidence sure/i.test(latestAnswer.summary)
  ) {
    add("recall_check", 20_000);
    forced = "recall_check";
    forcedReason =
      "A correct but uncertain answer is fragile, so this target returns sooner.";
  }

  const weakPrerequisite = learner?.mastery
    .filter(
      (item) => item.evidenceCount >= 2 && item.masteryBasisPoints < 5_500,
    )
    .find((item) =>
      dimensions.prerequisites.some(
        (prerequisite) => prerequisite.conceptKey === item.conceptId,
      ),
    );
  if (
    weakPrerequisite &&
    weights.prerequisite_check > 0 &&
    !used.includes("prerequisite_check")
  ) {
    forced = "prerequisite_check";
    forcedReason = `Recent evidence shows the ${weakPrerequisite.conceptId.replace(/[-_]/g, " ")} prerequisite needs a short check before this topic.`;
  } else if (
    learner?.errors[0]?.category === "prerequisite_gap" &&
    weights.prerequisite_check > 0 &&
    !used.includes("prerequisite_check")
  ) {
    forced = "prerequisite_check";
    forcedReason =
      "Recent prerequisite-gap evidence makes a short foundation check useful now.";
  }

  if (state.moves.remaining <= 2) {
    for (const move of PETROS_CLOSING_MOVES) add(move, 10_000);
  }
  if (state.moves.remaining === 0 && !used.includes("artifact_commit")) {
    weights.artifact_commit = Math.max(weights.artifact_commit, 10_000);
    for (let index = exclusions.length - 1; index >= 0; index -= 1) {
      if (exclusions[index]?.move === "artifact_commit") exclusions.splice(index, 1);
    }
    forced = "artifact_commit";
    forcedReason =
      "The bounded teaching checkpoints are complete, so the learner now chooses what to keep.";
  } else if (state.moves.remaining === 1) {
    forced =
      dimensions.moves.closingPattern.find((move) => weights[move] > 0) ??
      "synthesis";
    forcedReason = "The last move closes the session deliberately.";
  }

  const mandate = (move: PetrosMoveType, reason: string) => {
    weights[move] = Math.max(weights[move], 10_000);
    for (let candidate = exclusions.length - 1; candidate >= 0; candidate -= 1) {
      if (exclusions[candidate]?.move === move) exclusions.splice(candidate, 1);
    }
    forced = move;
    forcedReason = reason;
  };
  if (reexplanation) {
    mandate(
      "layered_explanation",
      reexplanation.level === "simpler"
        ? "The learner explicitly asked for the current idea again in plainer language and smaller steps."
        : "The learner explicitly asked to inspect the current idea at greater depth.",
    );
  } else if (index === 0 && (institution?.syllabus.decision === "outside_bounds" || institution?.syllabus.decision === "depth_limited")) {
    mandate("goal_frame", institution.syllabus.studentMessage);
  } else if (guidedHomework && index === 0) {
    mandate("layered_explanation", `${institution.homework!.studentMessage} Teach the setup and method before asking the learner to continue it.`);
  } else if (fiveMinute) {
    if (index === 0) mandate("layered_explanation", "Five-minute mode begins with one concise explanation instead of a test.");
    else if (index === 1 && visualAvailable) mandate("diagram", "Five-minute mode now makes the explanation visible with one bounded diagram.");
    else if (index === 1) mandate("worked_example", "The visual capability is unavailable, so one compact worked example makes the idea concrete.");
    else if (index === 2) mandate("recall_check", "Five-minute mode now uses its single retrieval check.");
    else mandate("artifact_commit", "Five-minute mode closes with one curated card and never expands automatically.");
  } else if (index === 0 && fromSnap) {
    mandate("layered_explanation", "The photographed-question opening teaches the student-confirmed stuck point before any full solution.");
  } else if (index === 0 && fromHandwriting) {
    mandate("worked_example", "The handwriting repair begins at the confirmed first logical break and supports a reattempt.");
  } else if (index === 0) {
    mandate(
      "layered_explanation",
      state.sourceContext?.door === "uploaded_document"
        ? "The selected document page grounds a direct explanation before Petros asks the learner to answer anything."
        : "A new teaching target starts with a direct explanation before Petros asks the learner to answer anything.",
    );
  } else if (
    index === 1 &&
    state.sourceContext?.door === "uploaded_document" &&
    visualAvailable &&
    !used.includes("diagram")
  ) {
    mandate("diagram", "The document-led explanation now becomes a visual, editable diagram before any knowledge check.");
  }

  const lastTwo = used.slice(-2);
  if (lastTwo.length === 2 && lastTwo[0] === lastTwo[1])
    exclude(lastTwo[0]!, "A third consecutive identical move is forbidden.");
  else if (used.at(-1))
    weights[used.at(-1)!] = Math.round(weights[used.at(-1)!] * 0.2);

  const selected =
    forced && weights[forced] > 0
      ? forced
      : PETROS_MOVE_TYPES.reduce(
          (best, move) => (weights[move] > weights[best] ? move : best),
          "layered_explanation",
        );
  const total =
    PETROS_MOVE_TYPES.reduce(
      (sum, move) => sum + Math.max(0, weights[move]),
      0,
    ) || 1;
  const normalized = Object.fromEntries(
    PETROS_MOVE_TYPES.map((move) => [move, Math.max(0, weights[move]) / total]),
  ) as Record<PetrosMoveType, number>;
  const checkpoint =
    state.checkpointPlan[Math.min(index, state.checkpointPlan.length - 1)]!;
  const pendingQuestion = [...state.observations.recent]
    .reverse()
    .find((observation) => observation.type === "question_asked");
  const closing = PETROS_CLOSING_MOVES.includes(
    selected as (typeof PETROS_CLOSING_MOVES)[number],
  );
  const artifactClosesSession =
    selected === "artifact_commit" && state.moves.remaining <= 1;
  const common = {
    schemaVersion: PETROS_PLAN_SCHEMA_VERSION,
    targetConcept: state.topic,
    studentSafeReason: studentReason(
      selected,
      state,
      forcedReason,
      capabilityFallback,
    ),
    decisionFactors: [
      ...(typeof state.sourceContext?.door === "string"
        ? [`Contextual door: ${state.sourceContext.door.replace(/_/g, " ")}`]
        : []),
      ...(typeof state.sourceContext?.emotionalRegister === "string"
        ? [`Emotional register: ${state.sourceContext.emotionalRegister.replace(/_/g, " ")}`]
        : []),
      `Published profile: ${state.resolvedTopicProfile.profile.identity.canonicalTitle}`,
      `Profile resolution: ${state.resolvedTopicProfile.resolution.replace(/_/g, " ")}`,
      `Current checkpoint: ${checkpoint.label}`,
      `${state.moves.remaining} move${state.moves.remaining === 1 ? "" : "s"} remain`,
      ...(forcedReason ? [forcedReason] : []),
      ...(capabilityFallback ? [capabilityFallback] : []),
      ...(state.learnerSnapshot?.causalFactors ?? []),
    ].slice(0, 8),
    expectedEvidence: evidenceFor(selected),
    progressEffect: {
      checkpointId: checkpoint.id,
      effect: reexplanation ? ("hold" as const) : closing ? ("complete" as const) : ("advance" as const),
      progressDelta: reexplanation ? (0 as const) : (1 as const),
    },
    canStream: selected === "layered_explanation" || selected === "story",
    termination: {
      recommendation:
        artifactClosesSession
          ? ("goal_met" as const)
          : ("continue" as const),
      reason:
        artifactClosesSession
          ? "The learner has completed the teaching checkpoints and explicitly curated the session residue."
          : "A later checkpoint remains in the bounded session.",
    },
    guessFirst: {
      status: reexplanation || noGuessFirst(selected)
        ? ("not_applicable" as const)
        : ("required" as const),
      targetId: reexplanation || noGuessFirst(selected)
        ? null
        : `${checkpoint.id}:${slug(state.topic)}:${selected}`.slice(0, 160),
      reason: reexplanation
        ? "The learner already committed to this step and explicitly requested a clearer rendering."
        : noGuessFirst(selected)
          ? "This teaching, framing, or closing move is shown directly; it does not require a preliminary answer."
        : "A cheap commitment before reveal makes this move responsive to the learner.",
    },
    observationResponse: pendingQuestion
      ? {
          causalObservationIds: [pendingQuestion.id],
          action: "answer_now" as const,
          acknowledgement:
            "Your question changes this checkpoint, so it is now inside the learning path.",
          routeChange: `The ${selected.replace(/_/g, " ")} addresses your question before the main goal continues.`,
          returnPlan: `Then return to: ${state.currentGoal}`,
        }
      : latestAnswer
        ? {
            causalObservationIds: [latestAnswer.id],
            action:
              /\bcorrect\b/i.test(latestAnswer.summary) &&
              !/confidence sure/i.test(latestAnswer.summary)
                ? ("recheck" as const)
                : ("continue" as const),
            acknowledgement: null,
            routeChange:
              /\bcorrect\b/i.test(latestAnswer.summary) &&
              !/confidence sure/i.test(latestAnswer.summary)
                ? "A correct but uncertain answer brings this target back sooner."
                : null,
            returnPlan: null,
          }
        : {
            causalObservationIds: [],
            action: "continue" as const,
            acknowledgement: null,
            routeChange: null,
            returnPlan: null,
          },
    selectionPolicy: {
      normalizedCandidateWeights: normalized,
      exclusions,
      selectedWeight: normalized[selected],
      override: forced
        ? {
            policy: "profile_or_session_mandate",
            from: null,
            to: selected,
            reason: forcedReason,
          }
        : null,
      capabilityFallback,
    },
  };
  return petrosPlanDecisionSchema.parse({
    ...common,
    selectedMoveType: selected,
    moveParameters: parametersFor(selected, state, probeCount),
  });
}

/**
 * These decisions are product guarantees, not model preferences. A live PLAN response still runs
 * for observability, but the server must replace it when it conflicts with a bounded teaching
 * contract (most importantly: teach before testing a new target).
 */
export function requiresDeterministicPolicyEnvelope(state: PetrosSessionState): boolean {
  const index = state.moves.used;
  return Boolean(
    requestedReexplanation(state) ||
    index === 0 ||
    state.moves.remaining <= 1 ||
    state.sourceContext?.door === "five_minute" ||
    (index === 1 && state.sourceContext?.door === "uploaded_document"),
  );
}

export function deterministicRender(
  decision: PetrosPlanDecision,
  state: PetrosSessionState,
): PetrosTeachingBlockContent {
  const topic = state.topic;
  const profile = state.resolvedTopicProfile.profile.dimensions;
  const sources = sourceGrounding(state);
  switch (decision.selectedMoveType) {
    case "hook":
      return render({
        type: "hook",
        title: `A reason to care about ${topic}`,
        prompt: `What would change if ${topic} suddenly stopped working in a familiar system?`,
        reveal: `${topic} matters because a small change in its mechanism can produce a much larger visible outcome.`,
        anchor:
          profile.realWorldAnchors.examples[0] ??
          `A grounded application of ${topic}`,
      });
    case "prerequisite_check":
      return render({
        type: "prerequisite_check",
        title: "Check the foundation first",
        instructions:
          "Answer quickly from memory. A miss opens a short foundation detour before the main topic.",
        prerequisites: profile.prerequisites
          .slice(0, 4)
          .map((item) => ({ key: item.conceptKey, label: item.label })),
        detourMessage:
          "A wrong answer here is useful evidence: Petros will rebuild this prerequisite before continuing.",
      });
    case "goal_frame": {
      const syllabusDecision = institutionalDecision(state)?.syllabus;
      return render({
        type: "goal_frame",
        title: "A finite target for this session",
        goal:
          syllabusDecision && syllabusDecision.decision !== "within_bounds"
            ? syllabusDecision.studentMessage
            : state.currentGoal,
        timeEstimateMinutes: Math.max(
          1,
          Math.ceil(state.time.remainingSeconds / 60),
        ),
        checkpoints: state.checkpointPlan
          .filter((item) => item.status !== "complete")
          .map((item) => item.label)
          .slice(0, 6),
      });
    }
    case "layered_explanation":
      if (state.sourceContext?.door === "snap_question") {
        const stuckPoint = typeof state.learnerContext.stuckPoint === "string"
          ? state.learnerContext.stuckPoint.replace(/_/g, " ")
          : "the point you selected";
        return render({
          type: "layered_explanation",
          title: "Start at the stuck point",
          firstLayer: `You marked ${stuckPoint}. Before solving, name what the question gives, what it asks for, and the one relationship connecting them.`,
          deeperLayers: [
            {
              id: "fastest-step",
              label: "Fastest useful next step",
              content: `Take only the first justified step for ${state.topic}; pause before any final answer so you can choose the method yourself.`,
            },
          ],
          keyIdea: "A correct setup is evidence of understanding even before the arithmetic is finished.",
          sourceGrounding: sources,
        });
      }
      return render({
        type: "layered_explanation",
        title: `Build the key idea in ${topic}`,
        firstLayer: `${topic} becomes easier when you name what changes, what stays fixed, and the relationship connecting them.`,
        deeperLayers: [
          {
            id: "mechanism",
            label: "Go one layer deeper",
            content: `Connect each detail back to this goal: ${state.currentGoal}. That turns separate facts into a usable explanation.`,
          },
        ],
        keyIdea: `Every detail should help explain or apply the central relationship in ${topic}.`,
        sourceGrounding: sources,
      });
    case "worked_example":
      if (state.sourceContext?.door === "handwriting") {
        const teachingStep = typeof state.topicContext.teachingStep === "string"
          ? state.topicContext.teachingStep
          : "Repair the first unsupported step before changing later arithmetic.";
        const reattempt = typeof state.topicContext.reattemptPrompt === "string"
          ? state.topicContext.reattemptPrompt
          : "Rewrite only the first broken line, then continue from your own work.";
        return render({
          type: "worked_example",
          title: "Repair the first break, not the whole page",
          problemStatement: reattempt,
          steps: [
            { id: "first-break", title: "Locate the first unsupported line", explanation: teachingStep, predictionPrompt: "What should this line say before you look at the correction?" },
            { id: "repair", title: "Repair only that line", explanation: "Keep every earlier correct line and change the smallest necessary step." },
            { id: "consequences", title: "Recheck later lines", explanation: "Separate new errors from values that are wrong only because they followed the first break." },
          ],
          finalCheck: "Can you now reattempt the broken line without copying a replacement solution?",
          sourceGrounding: sources,
        });
      }
      return render({
        type: "worked_example",
        title: `Work through one ${topic} decision`,
        problemStatement: `Choose and apply the first useful step in a representative ${topic} problem.`,
        steps: [
          {
            id: "identify",
            title: "Identify the demand",
            explanation:
              "Read the command and given information before selecting a method.",
            predictionPrompt: "Which clue controls the first step?",
          },
          {
            id: "select",
            title: "Select the smallest fitting idea",
            explanation: `Choose the rule or relationship from ${topic} that directly answers the demand.`,
          },
          {
            id: "check",
            title: "Check the fit",
            explanation:
              "Verify that the result answers the command and uses the supplied evidence.",
          },
        ],
        finalCheck:
          "Why does this method fit better than the most tempting alternative?",
        sourceGrounding: sources,
      });
    case "analogy":
      return render({
        type: "analogy",
        title: `Map ${topic} onto something familiar`,
        familiarDomain: "a transport network",
        targetIdea: topic,
        mappings: [
          { familiar: "stations", target: "important concepts or states" },
          { familiar: "routes", target: "relationships or transitions" },
          {
            familiar: "route rules",
            target: "conditions that control what happens next",
          },
        ],
        limit:
          "The analogy helps with structure, but it does not replace the topic’s exact vocabulary or evidence.",
      });
    case "story":
      return render({
        type: "story",
        title: `${topic} as a sequence of causes and choices`,
        setup: `Treat ${topic} as a developing situation rather than a list of isolated facts.`,
        events: [
          {
            id: "pressure",
            label: "Pressure builds",
            detail:
              "A prior condition creates a problem that cannot remain unchanged.",
          },
          {
            id: "choice",
            label: "A choice redirects events",
            detail:
              "People or systems respond, creating consequences and alternatives.",
          },
          {
            id: "result",
            label: "The outcome changes the next question",
            detail:
              "The consequence matters because it becomes the starting condition for what follows.",
          },
        ],
        takeaway: `For ${topic}, remember the causal thread: condition → choice → consequence.`,
      });
    case "derivation":
      return render({
        type: "derivation",
        title: `Derive the ${topic} relationship`,
        startingAssumptions: [
          "Use only the stated definitions and previously established relationships.",
        ],
        steps: [
          {
            id: "start",
            expression: "Start from the known relationship",
            explanation:
              "Write the exact statement already justified by the prerequisites.",
          },
          {
            id: "transform",
            expression: "Apply one reversible transformation",
            explanation: "Change one thing at a time and name the rule used.",
          },
          {
            id: "arrive",
            expression: "Isolate the target result",
            explanation: "Check that each earlier assumption still holds.",
          },
        ],
        conclusion: `The result follows from explicit assumptions; it is not a rule that must be memorised without a reason.`,
      });
    case "diagram": {
      const nodes = profile.prerequisites.length
        ? [
            {
              id: "topic",
              label: topic,
              description: `The target idea: ${topic}`,
            },
            ...profile.prerequisites.slice(0, 4).map((item) => ({
              id: slug(item.conceptKey),
              label: item.label,
              description: `${item.requiredness} prerequisite`,
            })),
          ]
        : [
            {
              id: "input",
              label: "Starting condition",
              description: `What ${topic} begins with`,
            },
            {
              id: "process",
              label: topic,
              description: "The central process or relationship",
            },
            {
              id: "outcome",
              label: "Outcome",
              description: `What ${topic} produces or explains`,
            },
          ];
      return render({
        type: "diagram",
        title: `See the structure of ${topic}`,
        diagramType: profile.representations.some(
          (item) => item.type === "sequential",
        )
          ? "flowchart"
          : "concept_map",
        nodes,
        edges: nodes.slice(1).map((node) => ({
          from: node.id,
          to: nodes[0]!.id,
          label: "supports",
        })),
        altText: `A structured diagram with ${nodes[0]!.label} connected to ${nodes
          .slice(1)
          .map((node) => node.label)
          .join(", ")}.`,
        editable: true,
        fallbackText: nodes
          .map((node) => `${node.label}: ${node.description}`)
          .join("\n"),
      });
    }
    case "predict_then_reveal":
      return render({
        type: "predict_then_reveal",
        title: "Commit before the reveal",
        prompt: `Predict the next change or useful step in ${topic}.`,
        reveal: `The useful next step follows the controlling relationship, not the most visually obvious detail.`,
        explanation: `Committing first makes the difference between your prediction and the mechanism visible.`,
      });
    case "contrast_case":
      return render({
        type: "contrast_case",
        title: `Two similar-looking ${topic} cases`,
        left: {
          label: "Case A",
          prompt: "The question asks for the mechanism or method.",
          method: "Use the rule that explains how the change happens.",
        },
        right: {
          label: "Case B",
          prompt: "The question asks for evidence, comparison, or consequence.",
          method: "Use the relationship that distinguishes the two outcomes.",
        },
        keyDistinction:
          "The command and controlling clue—not surface wording—determine the method.",
      });
    case "misconception_demolition": {
      const misconception = profile.misconceptions[0]!;
      return render({
        type: "misconception_demolition",
        title: "Test the tempting wrong intuition",
        misconception: misconception.summary,
        commitmentPrompt:
          "Would you agree with that statement before seeing the evidence?",
        correction: misconception.correctionAnchor,
        evidence: misconception.sourceReferences
          .map((source) => source.label)
          .slice(0, 5),
      });
    }
    case "socratic_probe":
      return render({
        type: "socratic_probe",
        title: `Probe ${decision.moveParameters.probeNumber} of 2`,
        probeNumber: decision.moveParameters.probeNumber,
        prompt: `Which single relationship in ${topic} would have to be true for this result to make sense?`,
        insightTarget: decision.moveParameters.insightTarget,
        explanationAfterCap: `After two probes Petros explains directly: start with the controlling relationship, connect it to the evidence, then check the outcome.`,
      });
    case "recall_check":
      return render({
        type: "recall_check",
        title: `Bring ${topic} back from memory`,
        instructions: "Answer without looking back, then tag your confidence.",
        questions: [
          {
            id: "key-idea",
            prompt: `Which response best describes the useful first move in ${topic}?`,
            responseType: "single_choice",
            choices: [
              {
                id: "key",
                label:
                  "Name the demand, choose the smallest fitting idea, then check the fit.",
              },
              {
                id: "detail",
                label:
                  "List every remembered detail before reading the command.",
              },
              {
                id: "length",
                label:
                  "Choose the longest method because it should earn more marks.",
              },
            ],
          },
        ],
        answerContract: {
          completion: "all_questions_answered",
          responseHandling: "evaluate_stage_3",
        },
        feedback: {
          submittedMessage:
            "Your response is locked and has changed what happens next.",
          stageBoundary:
            "Confidence and struggle support stay attached to this checkpoint.",
        },
      });
    case "apply_to_your_world":
      return render({
        type: "apply_to_your_world",
        title: `Where ${topic} shows up for you`,
        prompt: `Choose one place in your syllabus, exam, or daily experience where ${topic} changes a decision.`,
        examples: profile.realWorldAnchors.examples.length
          ? profile.realWorldAnchors.examples
          : [`A syllabus-safe application of ${topic}`],
        examShape:
          state.sessionType === "repair" || state.sessionType === "revise"
            ? "State the controlling idea, apply it to the given evidence, and make the final link explicit."
            : null,
      });
    case "synthesis":
      return render({
        type: "synthesis",
        title: `Make the ${topic} idea yours`,
        prompt: `Complete this in one specific sentence: “The most useful thing I now understand about ${topic} is…”`,
        tighteningGuidance:
          "Name the relationship or decision you would use, not only the chapter heading.",
        forwardLink: `This becomes a starting point for the next unfamiliar ${topic} question.`,
      });
    case "artifact_commit":
      return render({
        type: "artifact_commit",
        title: "Choose what should remain yours",
        prompt:
          "Review these proposals. Nothing is saved without your explicit choice.",
        proposals: [
          {
            id: "flashcard",
            kind: "flashcard",
            label: `${topic} recall card`,
            preview: `Name the demand → choose the controlling idea → check the fit.`,
          },
          {
            id: "note",
            kind: "note",
            label: `${topic} source note`,
            preview: `The controlling idea for ${topic}, linked back to this session.`,
          },
          {
            id: "diagram",
            kind: "diagram",
            label: `${topic} structure`,
            preview: "An editable structured diagram from this session.",
          },
        ],
        consentRequired: true,
      });
    case "forward_link":
      return render({
        type: "forward_link",
        title: "What this unlocks next",
        nextConcept: `a less familiar use of ${topic}`,
        connection: `The relationship you used here becomes the tool for choosing a method when surface clues are weaker.`,
        openQuestion: `Next time: what changes when one assumption behind ${topic} no longer holds?`,
      });
  }
}

export function applyRepetitionGuard(
  decision: PetrosPlanDecision,
  priorMoves: PetrosSessionState["priorMoves"],
): { decision: PetrosPlanDecision; intervention?: Record<string, unknown> } {
  const previous = priorMoves
    .slice(-2)
    .map((move) => move.decision.selectedMoveType);
  if (
    previous.length < 2 ||
    previous.some((move) => move !== decision.selectedMoveType)
  )
    return { decision };
  const replacement: PetrosMoveType =
    decision.selectedMoveType === "recall_check"
      ? "layered_explanation"
      : "recall_check";
  const guarded = petrosPlanDecisionSchema.parse({
    ...decision,
    selectedMoveType: replacement,
    moveParameters:
      replacement === "recall_check"
        ? {
            questionCount: 1,
            answerMode: "short_answer",
            coverage: decision.targetConcept,
          }
        : {
            layerCount: 2,
            emphasis: decision.targetConcept,
            sourceGroundingRequired: false,
          },
    studentSafeReason: `${decision.studentSafeReason} The learning action changes now to avoid a third repetition.`,
    decisionFactors: [
      ...decision.decisionFactors,
      "Repetition guard prevented a third consecutive identical move.",
    ].slice(0, 8),
    selectionPolicy: {
      ...decision.selectionPolicy,
      selectedWeight:
        decision.selectionPolicy.normalizedCandidateWeights[replacement] ?? 0,
      override: {
        policy: "no_three_consecutive_moves",
        from: decision.selectedMoveType,
        to: replacement,
        reason: "A third consecutive identical move is not permitted.",
      },
    },
  });
  return {
    decision: guarded,
    intervention: {
      policy: "no_three_consecutive_moves",
      originalMoveType: decision.selectedMoveType,
      overrideMoveType: replacement,
      reason: "A third consecutive identical move is not permitted.",
    },
  };
}

export function terminalReason(
  state: PetrosSessionState,
  status: string,
): "time_up" | "max_moves" | "paused" | "closed" | null {
  if (status === "paused") return "paused";
  if (status === "closed") return "closed";
  const hasArtifactCommit = state.priorMoves.some(
    (move) => move.decision.selectedMoveType === "artifact_commit",
  );
  if (!hasArtifactCommit && state.moves.remaining <= 0) return null;
  if (state.time.remainingSeconds <= 0) return "time_up";
  if (state.moves.remaining <= 0) return "max_moves";
  return null;
}

function parametersFor(
  move: PetrosMoveType,
  state: PetrosSessionState,
  probeCount: number,
) {
  const profile = state.resolvedTopicProfile.profile.dimensions;
  switch (move) {
    case "hook":
      return {
        anchorStyle:
          profile.realWorldAnchors.quality >= 3 ? "real_world" : "question",
        revealAfterCommit: true,
      };
    case "prerequisite_check":
      return {
        conceptKeys: profile.prerequisites
          .slice(0, 4)
          .map((item) => item.conceptKey),
        mandatory: profile.prerequisiteDensity >= 3,
        questionCount: Math.min(3, Math.max(1, profile.prerequisites.length)),
      };
    case "goal_frame":
      return {
        timeboxMinutes: Math.max(
          1,
          Math.ceil(state.time.remainingSeconds / 60),
        ),
        outcomeVerb: state.currentGoal,
      };
    case "layered_explanation": {
      const reexplanation = requestedReexplanation(state);
      const effectiveDepth =
        reexplanation?.level === "deeper"
          ? "deep"
          : reexplanation?.level === "simpler"
            ? "concise"
            : state.learnerSnapshot?.sessionOverride?.depth ??
              state.learnerSnapshot?.preference.depth;
      return {
        layerCount:
          effectiveDepth === "deep" ? 3 : effectiveDepth === "concise" ? 1 : 2,
        emphasis: reexplanation
          ? `${reexplanation.level === "simpler" ? "Use plain language and smaller prerequisite steps" : "Add mechanism, nuance, and connections"}; faithfully re-explain source block ${reexplanation.sourceBlockId}.`
          : state.currentGoal,
        sourceGroundingRequired: Boolean(state.sourceContext),
      };
    }
    case "worked_example":
      return {
        stepCount: 3,
        predictionPoints: 1,
        problemStyle:
          state.sessionType === "repair" || state.sessionType === "revise"
            ? "exam_shaped"
            : "procedural",
      };
    case "analogy":
      return {
        familiarDomain: "a familiar system",
        mappingCount: 3,
        nameLimits: true,
      };
    case "story":
      return {
        eventCount: 3,
        perspective: "cause, choice, and consequence",
        chronologyRequired: true,
      };
    case "derivation":
      return {
        stepCount: 3,
        startingAssumption:
          "Previously established definitions and relationships",
        depthSignal: "The learner explicitly requested depth.",
      };
    case "diagram":
      return {
        diagramType: profile.representations.some(
          (item) => item.type === "sequential",
        )
          ? "flowchart"
          : "concept_map",
        editable: true,
        fallback: "structured_text",
      };
    case "predict_then_reveal":
      return { predictionMode: "short_answer", revealKind: "next_step" };
    case "contrast_case":
      return {
        distinction: "The controlling clue changes the correct method.",
        examShaped:
          state.sessionType === "repair" || state.sessionType === "revise",
      };
    case "misconception_demolition":
      return {
        misconceptionKey:
          profile.misconceptions[0]?.key ?? "published-misconception",
        commitmentRequired: true,
      };
    case "socratic_probe":
      return {
        probeNumber: Math.min(2, probeCount + 1),
        insightTarget: state.currentGoal,
        explainAfterThis: probeCount + 1 >= 2,
      };
    case "recall_check":
      return {
        questionCount: 1,
        answerMode: "single_choice",
        coverage: state.currentGoal,
      };
    case "apply_to_your_world":
      return {
        contextKind:
          state.sessionType === "repair" || state.sessionType === "revise"
            ? "exam"
            : "syllabus",
        examShaped:
          state.sessionType === "repair" || state.sessionType === "revise",
      };
    case "synthesis":
      return {
        promptStyle: "one_sentence",
        includeForwardLink: true,
        focus: state.currentGoal,
      };
    case "artifact_commit":
      return {
        artifactKinds: ["flashcard", "note", "diagram"],
        requireExplicitConsent: true,
      };
    case "forward_link":
      return {
        nextConcept: `a less familiar use of ${state.topic}`,
        unfinishedThread: true,
      };
  }
}

function render(value: Record<string, unknown>): PetrosTeachingBlockContent {
  return petrosTeachingBlockContentSchema.parse({
    schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
    ...value,
  });
}

function evidenceFor(move: PetrosMoveType) {
  const evidence: Record<PetrosMoveType, string> = {
    hook: "The learner commits to a prediction before the anchor is revealed.",
    prerequisite_check:
      "The learner answers the prerequisite prompts and any miss opens a detour.",
    goal_frame: "The learner can see the bounded outcome and checkpoints.",
    layered_explanation:
      "The learner resolves the commitment and chooses whether to inspect deeper layers.",
    worked_example: "The learner predicts and reveals the example steps.",
    analogy:
      "The learner can map the familiar elements and name where the analogy stops.",
    story: "The learner can trace condition, choice, and consequence.",
    derivation:
      "The learner can justify each transformation from the stated assumptions.",
    diagram:
      "The learner can inspect or edit a structured diagram and access its nonvisual description.",
    predict_then_reveal:
      "The learner commits before comparing prediction with the outcome.",
    contrast_case:
      "The learner identifies the clue that changes the correct method.",
    misconception_demolition:
      "The learner commits to the tempting intuition and updates it from sourced evidence.",
    socratic_probe:
      "The learner responds to one of no more than two probes before direct explanation.",
    recall_check: "The learner retrieves an answer and records confidence.",
    apply_to_your_world:
      "The learner names a syllabus, exam, or personal application.",
    synthesis: "The learner writes a specific one-sentence synthesis.",
    artifact_commit:
      "The learner explicitly selects or declines proposed artifacts.",
    forward_link:
      "The learner sees what this idea unlocks and the unfinished thread.",
  };
  return evidence[move];
}

function studentReason(
  move: PetrosMoveType,
  state: PetrosSessionState,
  forcedReason: string,
  capabilityFallback: string | null,
) {
  if (forcedReason)
    return `${forcedReason} That makes ${move.replace(/_/g, " ")} the safest next action.`;
  if (capabilityFallback)
    return `${capabilityFallback} The profile still points toward ${move.replace(/_/g, " ")} for this checkpoint.`;
  const door = state.sourceContext?.door;
  if (door === "result_repair")
    return `This Repair session begins from a published result, so ${move.replace(/_/g, " ")} stays specific, practical, and free of a cheerful hook.`;
  if (door === "upcoming_exam")
    return `The published exam scope makes ${move.replace(/_/g, " ")} useful for calm, exam-shaped retrieval now.`;
  if (door === "uploaded_document")
    return `The selected document citation keeps ${move.replace(/_/g, " ")} grounded in the learner's authorized page.`;
  if (door === "learning_path")
    return `The current evidence-gated path node makes ${move.replace(/_/g, " ")} the next progressive step without marking it complete.`;
  if (door === "assistant_handoff")
    return `The accepted screen question makes ${move.replace(/_/g, " ")} a direct continuation rather than a new generic chat.`;
  if (door === "active_homework")
    return `The active related assignment rule makes ${move.replace(/_/g, " ")} useful without supplying the final answer.`;
  if (door === "snap_question")
    return `The student confirmed both the photographed question and where they are stuck, so ${move.replace(/_/g, " ")} teaches the fastest useful next step without dumping a solution.`;
  if (door === "handwriting")
    return `The student corrected the recognized lines, so ${move.replace(/_/g, " ")} begins at the first logical break and keeps consequence errors separate.`;
  if (door === "voice")
    return `This optional voice session needs a concise, speakable ${move.replace(/_/g, " ")} with the complete equivalent kept in text.`;
  if (door === "five_minute")
    return `The finite five-minute promise makes ${move.replace(/_/g, " ")} the single bounded action for this checkpoint; expansion remains an explicit choice.`;
  const learnerFactor = state.learnerSnapshot?.causalFactors[0];
  if (learnerFactor)
    return `${learnerFactor} That evidence and this topic profile make ${move.replace(/_/g, " ")} useful next.`;
  return `The published ${state.topic} profile and this checkpoint give ${move.replace(/_/g, " ")} the strongest eligible weight now.`;
}

function noGuessFirst(move: PetrosMoveType) {
  return (
    move === "goal_frame" ||
    move === "hook" ||
    move === "layered_explanation" ||
    move === "worked_example" ||
    move === "contrast_case" ||
    move === "story" ||
    move === "diagram" ||
    move === "derivation" ||
    move === "misconception_demolition" ||
    move === "apply_to_your_world" ||
    PETROS_CLOSING_MOVES.includes(move as (typeof PETROS_CLOSING_MOVES)[number])
  );
}

function institutionalDecision(state: PetrosSessionState) {
  const value = state.sourceContext?.institutionalDecision;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as {
    syllabus: { decision: "within_bounds" | "depth_limited" | "outside_bounds"; studentMessage: string };
    homework: { mode: "normal" | "guided_homework"; studentMessage: string } | null;
  };
}

export function requestedReexplanation(state: PetrosSessionState) {
  const value = state.learnerContext.pendingReexplanation;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const level = candidate.level;
  const sourceBlockId = candidate.sourceBlockId;
  if ((level !== "simpler" && level !== "deeper") || typeof sourceBlockId !== "string")
    return null;
  return { level, sourceBlockId };
}

function sourceGrounding(state: PetrosSessionState) {
  if (!state.sourceContext) return [];
  if (Array.isArray(state.sourceContext.citations)) {
    return state.sourceContext.citations
      .filter(isRecord)
      .map((citation) => {
        const label =
          typeof citation.label === "string" ? citation.label.slice(0, 160) : "Session source";
        const page = typeof citation.page === "number" ? `p. ${citation.page}` : null;
        const section = typeof citation.section === "string" ? citation.section : null;
        const version = typeof citation.version === "string" ? `v. ${citation.version}` : null;
        return {
          label,
          reference: [page, section, version].filter(Boolean).join(" · ").slice(0, 500) || undefined,
        };
      })
      .slice(0, 8);
  }
  const label =
    typeof state.sourceContext.label === "string"
      ? state.sourceContext.label
      : "Session source";
  const reference =
    typeof state.sourceContext.referenceId === "string"
      ? state.sourceContext.referenceId
      : undefined;
  return [{ label, ...(reference ? { reference } : {}) }];
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
