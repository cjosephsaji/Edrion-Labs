import type { TopicShapeV1 } from '@edrion/schemas';
import { detectNameTemplate } from '../tutor/tutor-charter';
import type { CapabilitySet, LearnSurfaceId } from '../capabilities/capability-resolver';
import type { FixtureBlock } from './fixture-lesson';
import type { GeneratedLesson } from './lesson-blocks.schema';

const TEACHING_OPEN = new Set<string>(['explanation', 'worked_example', 'graph_plot', 'code_trace']);

export type LessonValidationIssue = { code: string; detail: string };

export function validateGeneratedLesson(
  lesson: GeneratedLesson,
  opts: { topicTitle: string; capabilities: CapabilitySet },
): { ok: true; blocks: FixtureBlock[] } | { ok: false; issues: LessonValidationIssue[] } {
  const issues: LessonValidationIssue[] = [];
  const blocks = lesson.blocks;

  if (!blocks.length) {
    return { ok: false, issues: [{ code: 'empty', detail: 'No blocks' }] };
  }

  const first = blocks[0]!;
  if (!TEACHING_OPEN.has(first.surface)) {
    issues.push({
      code: 'open_with_test',
      detail: `Opened with ${first.surface}`,
    });
  }

  for (const b of blocks) {
    if (!opts.capabilities.surfaces.has(b.surface as LearnSurfaceId) && b.surface !== 'system_notice') {
      // system_notice + checkpoint always allowed via core
      if (b.surface !== 'checkpoint') {
        issues.push({ code: 'surface_forbidden', detail: b.surface });
      }
    }
    if (opts.capabilities.forbidden.has(b.surface as LearnSurfaceId)) {
      issues.push({ code: 'surface_forbidden', detail: b.surface });
    }

    if (b.surface === 'explanation') {
      if (detectNameTemplate(b.bodyMd, opts.topicTitle)) {
        issues.push({ code: 'name_template', detail: 'explanation body' });
      }
      if (b.deeperMd && normalize(b.deeperMd) === normalize(b.bodyMd)) {
        issues.push({ code: 'deeper_repeat', detail: 'deeperMd duplicates bodyMd' });
      }
      if (b.deeperMd && detectNameTemplate(b.deeperMd, opts.topicTitle)) {
        issues.push({ code: 'name_template', detail: 'explanation deeper' });
      }
    }
    if (b.surface === 'question_set') {
      if (detectNameTemplate(b.promptMd, opts.topicTitle)) {
        issues.push({ code: 'name_template', detail: 'question prompt' });
      }
      const correct = b.options.filter((o) => o.correct || o.id === b.answerKey.correctOptionId);
      if (correct.length < 1) {
        issues.push({ code: 'no_correct', detail: 'question_set missing correct option' });
      }
      const keyHit = b.options.some((o) => o.id === b.answerKey.correctOptionId);
      if (!keyHit) {
        issues.push({ code: 'bad_answer_key', detail: b.answerKey.correctOptionId });
      }
      for (const o of b.options) {
        const isCorrect = o.correct || o.id === b.answerKey.correctOptionId;
        if (!isCorrect && !o.mistake) {
          issues.push({ code: 'missing_mistake', detail: o.id });
        }
      }
    }
    if (b.surface === 'probe') {
      if (/core idea in your own words/i.test(b.questionMd)) {
        issues.push({ code: 'generic_probe', detail: b.questionMd });
      }
      if (detectNameTemplate(b.questionMd, opts.topicTitle)) {
        issues.push({ code: 'name_template', detail: 'probe' });
      }
    }
  }

  if (issues.length) return { ok: false, issues };

  const mapped: FixtureBlock[] = blocks.map((b, i) => {
    const id = `gen_${i}_${Math.random().toString(36).slice(2, 8)}`;
    if (b.surface === 'code_trace') {
      // FE may not render yet — fold into explanation so lesson still teaches.
      return {
        id,
        surface: 'explanation' as const,
        heading: 'Trace this',
        bodyMd: `${b.promptMd}\n\n\`\`\`\n${b.codeMd}\n\`\`\``,
        whyHere: b.whyHere,
      };
    }
    if (b.surface === 'question_set') {
      return {
        id,
        ...b,
        options: b.options.map((o) => ({
          ...o,
          correct: o.id === b.answerKey.correctOptionId ? true : o.correct,
        })),
      };
    }
    return { id, ...b } as FixtureBlock;
  });

  return { ok: true, blocks: mapped };
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Soft check used in tests — spine quality parity across families. */
export function spineHasSubstance(shape: TopicShapeV1): boolean {
  if (shape.spine.length < 2) return false;
  return shape.spine.every((s) => s.gist.trim().length >= 40 && !/^the central mechanism/i.test(s.gist));
}
