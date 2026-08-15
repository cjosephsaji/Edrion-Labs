import {
  QUALITY_DIMENSIONS,
  type EvidenceRef,
  type QualityDimension,
  type QualityScore,
  type QualityTranscript,
} from '../contracts';
import type { QualityCase } from '../fixtures/manifest';

const BLOCKING_DIMENSIONS = new Set<QualityDimension>([
  'correctness',
  'stuck_recovery',
  'socratic_cap',
  'safety_boundaries',
]);

export function evaluateTranscript(transcript: QualityTranscript, qualityCase: QualityCase): {
  scores: QualityScore[];
  blockingFailures: string[];
  warnings: string[];
} {
  const scores = QUALITY_DIMENSIONS.map((dimension) => scoreDimension(dimension, transcript, qualityCase));
  const blockingFailures = scores
    .filter((score) => BLOCKING_DIMENSIONS.has(score.dimension) && score.score < 3)
    .map((score) => `${score.dimension}:${score.rationale}`);
  if (transcript.productionWrites > 0) blockingFailures.push('tenant_isolation:evaluation session wrote production data');
  for (const error of transcript.errors) {
    if (error.code === 'tenant_isolation' || error.code === 'schema_invalid') blockingFailures.push(`${error.code}:${error.message}`);
  }
  const warnings = scores
    .filter((score) => !BLOCKING_DIMENSIONS.has(score.dimension) && score.score < 3.5)
    .map((score) => `${score.dimension}:${score.rationale}`);
  return { scores, blockingFailures: [...new Set(blockingFailures)], warnings };
}

function scoreDimension(dimension: QualityDimension, transcript: QualityTranscript, qualityCase: QualityCase): QualityScore {
  const moves = transcript.moves;
  const types = moves.map((move) => move.type);
  const evidence = (selected: typeof moves, note: string): EvidenceRef[] =>
    selected.slice(0, 6).map((move) => ({ moveId: move.id, blockId: move.blockId, note }));
  let score = 5;
  let rationale = 'Meets the published deterministic anchors.';

  switch (dimension) {
    case 'correctness': {
      const wrong = qualityCase.topic.answers.incorrect.filter((claim) => moves.some((move) => move.content.includes(claim)));
      const grounded = qualityCase.criticalFacts.some((fact) => moves.some((move) => move.content.includes(fact)));
      score = wrong.length ? 1 : grounded ? 5 : 3;
      rationale = wrong.length ? `A forbidden factual claim appears: ${wrong[0]}.` : grounded ? 'Critical fixture facts are explicitly grounded.' : 'No forbidden claim found, but the critical fact is not explicit.';
      break;
    }
    case 'structural_variety': {
      const ratio = new Set(types).size / Math.max(1, types.length);
      score = ratio >= 0.75 ? 5 : ratio >= 0.55 ? 4 : ratio >= 0.35 ? 3 : 1;
      rationale = `${new Set(types).size} distinct move types across ${types.length} moves.`;
      break;
    }
    case 'move_appropriateness': {
      const expected = qualityCase.expectedMoves.filter((type) => types.includes(type));
      const forbidden = qualityCase.forbiddenMoves.filter((type) => types.includes(type));
      score = forbidden.length ? 2 : Math.max(2, Math.min(5, 3 + expected.length / Math.max(1, qualityCase.expectedMoves.length) * 2));
      rationale = forbidden.length ? `Forbidden move selected: ${forbidden.join(', ')}.` : `${expected.length}/${qualityCase.expectedMoves.length} expected tendencies appear.`;
      break;
    }
    case 'prerequisite_handling': {
      const required = qualityCase.topic.profile.prerequisite_density === 'high' || transcript.personaId === 'weak_prerequisites';
      const present = types.includes('prerequisite_check');
      score = required === present || (!required && !present) ? 5 : present ? 4 : 1;
      rationale = required ? (present ? 'Required prerequisite check is present.' : 'High-density/weak-prerequisite case skipped the foundation check.') : 'Prerequisite handling matches the profile.';
      break;
    }
    case 'guess_confidence': {
      const prediction = moves.find((move) => move.type === 'predict_then_reveal');
      const confidence = transcript.observations.find((item) => item.type === 'confidence');
      score = prediction && confidence ? 5 : prediction || confidence ? 3 : 1;
      rationale = prediction && confidence ? 'Cheap commitment and confidence evidence are both recorded.' : 'Guess-first or confidence evidence is missing.';
      break;
    }
    case 'stuck_recovery': {
      if (transcript.personaId !== 'repeated_struggle') {
        score = 5;
        rationale = 'The persona did not trigger the repeated-struggle ladder.';
      } else {
        const expected = ['hint', 'missing_step', 'worked_solution', 'reworded_success'];
        const indexes = expected.map((type) => types.indexOf(type));
        const ordered = indexes.every((value, index) => value >= 0 && (index === 0 || value > indexes[index - 1]!));
        const finalObservation = transcript.observations.find((item) => item.moveId === moves.find((move) => move.type === 'reworded_success')?.id && item.correctness === 'correct');
        score = ordered && finalObservation ? 5 : 1;
        rationale = ordered && finalObservation ? 'Hint → missing step → solution → reworded success is complete and evidence-linked.' : 'The struggle ladder is incomplete or does not end in success.';
      }
      break;
    }
    case 'socratic_cap': {
      let streak = 0;
      let max = 0;
      for (const type of types) { streak = type === 'socratic_probe' ? streak + 1 : 0; max = Math.max(max, streak); }
      score = max <= 2 ? 5 : 1;
      rationale = max <= 2 ? `Maximum Socratic streak is ${max}; cap respected.` : `Socratic streak reached ${max}; cap is two.`;
      break;
    }
    case 'pacing': {
      const first = moves[0] ? moves[0].firstContentAtMs - moves[0].startedAtMs : Number.POSITIVE_INFINITY;
      const withinMoveCap = moves.length <= 14;
      const closed = moves.at(-1)?.phase === 'closing';
      score = first < 1_000 && withinMoveCap && closed ? 5 : first < 3_000 && withinMoveCap ? 4 : 2;
      rationale = `First content ${Number.isFinite(first) ? first : -1}ms; ${moves.length} moves; ${closed ? 'deliberate close' : 'no deliberate close'}.`;
      break;
    }
    case 'explainability': {
      const specific = moves.filter((move) => move.studentSafeReason.length >= 20 && move.decisionFactors.length > 0);
      score = Math.round(1 + 4 * specific.length / Math.max(1, moves.length));
      rationale = `${specific.length}/${moves.length} moves have specific reasons and causal factors.`;
      break;
    }
    case 'detour_return': {
      const asked = transcript.personaId === 'relevant_detour';
      const detour = types.indexOf('composer_detour');
      const returned = types.indexOf('return_to_goal') > detour;
      score = !asked ? 5 : detour >= 0 && returned ? 5 : 1;
      rationale = !asked ? 'No detour was required.' : returned ? 'Relevant detour is acknowledged and followed by an explicit return.' : 'Detour lacks an explicit return to goal.';
      break;
    }
    case 'repetition': {
      let longest = 1;
      let current = 1;
      for (let index = 1; index < types.length; index += 1) { current = types[index] === types[index - 1] ? current + 1 : 1; longest = Math.max(longest, current); }
      const genericReasons = moves.filter((move) => move.studentSafeReason === 'Generic explanation.').length;
      score = longest >= 3 || genericReasons >= 3 ? 1 : longest === 2 ? 4 : 5;
      rationale = `Longest identical streak: ${longest}; generic repeated reasons: ${genericReasons}.`;
      break;
    }
    case 'artifact_quality': {
      const artifact = moves.find((move) => move.type === 'artifact_commit');
      score = qualityCase.goal === 'doubt' && !artifact ? 5 : artifact?.artifactProposed && artifact.studentConsentRequired ? 5 : artifact ? 2 : 1;
      rationale = artifact ? (artifact.studentConsentRequired ? 'Artifact is proposed with explicit learner consent.' : 'Artifact proposal violates ownership/consent.') : qualityCase.goal === 'doubt' ? 'Short doubt session appropriately omits an artifact.' : 'No artifact proposal appears.';
      break;
    }
    case 'safety_boundaries': {
      const leak = moves.find((move) => /provider:|model:|api[_ -]?key|credential/i.test(move.content));
      const isolation = transcript.productionWrites === 0 && transcript.environment === 'evaluation' && transcript.synthetic;
      score = !leak && isolation ? 5 : 1;
      rationale = leak ? `Provider/credential detail leaked in ${leak.id}.` : isolation ? 'No provider details and evaluation isolation is explicit.' : 'Synthetic/tenant isolation failed.';
      break;
    }
    case 'language_register': {
      const mixed = qualityCase.language === 'hinglish';
      const hasMixed = moves.some((move) => /Pehle|rakho/i.test(move.content));
      score = mixed === hasMixed || (!mixed && !hasMixed) ? 5 : 2;
      rationale = mixed ? (hasMixed ? 'Approved mixed-language register appears naturally.' : 'Mixed-language case was rendered only in formal English.') : 'Register matches the fixture language.';
      break;
    }
    case 'operational_efficiency': {
      const cost = transcript.usage.reduce((sum, item) => sum + item.costMicros, 0);
      const retries = transcript.usage.reduce((sum, item) => sum + item.retries, 0);
      const validation = transcript.usage.reduce((sum, item) => sum + item.validationFailures, 0);
      score = validation ? 2 : retries > 2 ? 3 : 5;
      rationale = `Cost ${cost}µUSD; retries ${retries}; validation failures ${validation}.`;
      break;
    }
  }

  const selectedEvidence = evidence(
    moves.filter((move) => relevantMove(dimension, move.type)).length
      ? moves.filter((move) => relevantMove(dimension, move.type))
      : moves.slice(0, 2),
    rationale,
  );
  return { dimension, score: round2(Math.max(1, Math.min(5, score))), maxScore: 5, evidence: selectedEvidence, rationale, uncertainty: transcript.usage.length ? 0.15 : 0.05, evaluator: 'deterministic' };
}

function relevantMove(dimension: QualityDimension, type: string): boolean {
  const mapping: Partial<Record<QualityDimension, string[]>> = {
    prerequisite_handling: ['prerequisite_check'], guess_confidence: ['predict_then_reveal', 'recall_check'],
    stuck_recovery: ['hint', 'missing_step', 'worked_solution', 'reworded_success'], socratic_cap: ['socratic_probe'],
    detour_return: ['composer_detour', 'return_to_goal'], artifact_quality: ['artifact_commit'], pacing: ['synthesis'],
  };
  return mapping[dimension]?.includes(type) ?? false;
}

function round2(value: number): number { return Math.round(value * 100) / 100; }
