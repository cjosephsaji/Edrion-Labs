import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, schema, sql, type Database } from '@edrion/database';
import { petrosMentorStateSchema, type PetrosMentorDecision, type PetrosMentorFeedback, type PetrosMentorPlanInput, type PetrosMentorPreferences, type PetrosMentorState, type PetrosReflectionSurface } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosReflectionService } from '../petros-reflection/petros-reflection.service';
import { StudentMaterialsService } from '../materials/student-materials.service';
import { PetrosBriefingService } from './petros-briefing.service';
import { PetrosCompanionRepository } from './petros-companion.repository';
import { PetrosStudentContextService } from './petros-student-context.service';
import { buildMentorPlan, localDateKey, mentorMessage, rankMentorPriorities, recentActiveMinutes, type MentorCandidate } from './petros-mentor.engine';

@Injectable()
export class PetrosMentorService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly briefing: PetrosBriefingService,
    private readonly reflection: PetrosReflectionService,
    private readonly repo: PetrosCompanionRepository,
    private readonly context: PetrosStudentContextService,
    private readonly materials: StudentMaterialsService,
  ) {}

  private scope(principal: InstitutionalStudentPrincipal) {
    return { institutionId: principal.institutionId, studentId: principal.studentId };
  }

  private async state(principal: InstitutionalStudentPrincipal) {
    const row = await this.repo.findPreferences(this.scope(principal));
    return { state: petrosMentorStateSchema.parse(row?.mentorState ?? {}), proactiveAllowed: !row?.quietMode && row?.proactiveCheckIns !== false };
  }

  private async save(principal: InstitutionalStudentPrincipal, patch: Partial<PetrosMentorState>) {
    const table = schema.petrosStudentCompanionPreferences;
    await this.db.insert(table).values({ ...this.scope(principal), mentorState: patch }).onConflictDoUpdate({
      target: [table.institutionId, table.studentId],
      // Independent settings and plan updates do not overwrite each other.
      set: { mentorState: sql`${table.mentorState} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() },
    });
  }

  async preferences(principal: InstitutionalStudentPrincipal, preferences: PetrosMentorPreferences) {
    await this.save(principal, { preferences });
    return this.build(principal);
  }

  async plan(principal: InstitutionalStudentPrincipal, plan: PetrosMentorPlanInput) {
    const clock = await this.context.clock(principal);
    if (plan.availability.some((day) => day.date < localDateKey(new Date(clock.isoNow), clock.timeZone))) {
      throw new BadRequestException('Choose today or a future date for your study time.');
    }
    await this.save(principal, { plan, planConfirmed: true });
    return this.build(principal);
  }

  async feedback(principal: InstitutionalStudentPrincipal, input: PetrosMentorFeedback) {
    const decision = await this.build(principal, true);
    if (!decision.priorities.some((item) => item.key === input.key)) throw new NotFoundException('This recommendation is no longer available. Refresh your plan.');
    const table = schema.petrosStudentCompanionPreferences;
    const entry = JSON.stringify([{ ...input, at: new Date().toISOString() }]);
    const history = sql`coalesce(${table.mentorState}->'history', '[]'::jsonb) || ${entry}::jsonb`;
    await this.db.insert(table).values({ ...this.scope(principal), mentorState: { history: JSON.parse(entry) } }).onConflictDoUpdate({
      target: [table.institutionId, table.studentId],
      set: { mentorState: sql`jsonb_set(${table.mentorState}, '{history}', (select coalesce(jsonb_agg(value order by ordinal), '[]'::jsonb) from jsonb_array_elements(${history}) with ordinality as events(value, ordinal) where ordinal > jsonb_array_length(${history}) - 80))`, updatedAt: new Date() },
    });
    return this.build(principal);
  }

  async build(principal: InstitutionalStudentPrincipal, includeDeferred = false, now = new Date()): Promise<PetrosMentorDecision> {
    const [{ state, proactiveAllowed }, clock] = await Promise.all([this.state(principal), this.context.clock(principal, now)]);
    const unavailable: string[] = [];
    const collected = await Promise.allSettled([
      this.briefing.collect(principal, now),
      this.reflection.read(principal),
      this.momentum(principal, clock.timeZone, now),
      this.reading(principal),
    ]);
    const work = collected[0].status === 'fulfilled' ? collected[0].value : (unavailable.push('deadlines and tasks'), []);
    const reflection: PetrosReflectionSurface | null = collected[1].status === 'fulfilled' ? collected[1].value : (unavailable.push('learning progress'), null);
    if (reflection?.stale) unavailable.push('up-to-date practice evidence; refresh Progress');
    const momentum = collected[2].status === 'fulfilled' ? collected[2].value : (unavailable.push('learning history'), { completedToday: 0, practicedMinutesToday: 0, activeMinutes: 0, lastActivityAt: null });
    const kind = { due_work: 'work', exam: 'exam', active_session: 'session', review: 'review', reflection: 'practice', attendance: 'attendance', planner: 'planner', timetable: 'planner', feedback: 'practice' } as const;
    const candidates: MentorCandidate[] = work.filter((item) => item.href).map((item) => ({
      key: `${item.kind}:${item.entityId ?? item.title}`, kind: kind[item.kind], title: item.title,
      reason: item.detail, href: item.href!, entityType: item.entityType, entityId: item.entityId,
      deadlineAt: item.deadlineAt ?? null, subject: item.subject ?? null, weight: item.academicWeight,
      minutes: item.kind === 'due_work' ? 20 : 25,
    }));
    if (reflection?.stale) {
      candidates.push({ key: 'progress:refresh', kind: 'planner', title: 'Refresh Progress before choosing a practice topic', reason: 'There is newer learning activity. Refresh the evidence before deciding which topic needs practice.', href: '/progress', entityType: null, entityId: null, deadlineAt: null, subject: null, minutes: 5 });
    }
    if (reflection && !reflection.stale) {
      for (const recommendation of reflection.recommendations.filter((item) => item.status === 'active')) {
        const topic = reflection.map.topics.find((item) => item.conceptId === recommendation.conceptId);
        const exam = candidates.filter((item) => item.kind === 'exam' && topic && item.subject?.toLowerCase() === topic.subjectLabel.toLowerCase()).sort((a, b) => (a.deadlineAt ?? '').localeCompare(b.deadlineAt ?? ''))[0];
        candidates.push({
          key: `reflection:${recommendation.id}`, kind: 'practice', title: recommendation.title,
          reason: reflection.stale ? 'Refresh Progress before relying on this practice suggestion.' : recommendation.whyThis,
          href: '/progress', entityType: 'reflection_recommendation', entityId: recommendation.id,
          deadlineAt: exam?.deadlineAt ?? null, subject: topic?.subjectLabel ?? null, minutes: 25,
          weakness: !reflection.stale && topic?.state === 'shaky' ? 120 : 0,
          prerequisites: !reflection.stale ? topic?.dependentConceptIds.length : 0,
        });
      }
    }
    const ranked = rankMentorPriorities(candidates, includeDeferred ? { ...state, history: [] } : state, now, clock.timeZone);
    const priorities = includeDeferred ? ranked : ranked.slice(0, 16);
    const reading = collected[3].status === 'fulfilled' ? collected[3].value : (unavailable.push('study materials'), []);
    const resources: PetrosMentorDecision['resources'] = priorities.slice(0, 5).flatMap((priority) => {
      const relevant = reading.filter((item) => item.title.toLowerCase() === priority.title.toLowerCase() || (priority.subject && item.subject?.toLowerCase() === priority.subject.toLowerCase()));
      relevant.sort((a, b) => Number(b.title === priority.title) - Number(a.title === priority.title) || (a.pageCount ?? Infinity) - (b.pageCount ?? Infinity));
      const item = relevant[0];
      return item ? [{ priorityKey: priority.key, materialId: item.id, title: item.title, pageCount: item.pageCount, href: '/materials', reason: `${item.title === priority.title ? 'Linked by its published title to this work.' : `Published for ${priority.subject}.`} ${item.pageCount ? `${item.pageCount} extracted ${item.pageCount === 1 ? 'page' : 'pages'}; start by checking the relevant section.` : 'Open it to check which sections help.'} I haven’t verified that it covers the whole syllabus.` }] : [];
    });
    const lead = priorities[0];
    const deferred = !lead && rankMentorPriorities(candidates, { ...state, history: [] }, now, clock.timeZone).length > 0;
    const activeTooLong = momentum.activeMinutes >= 90 && lead?.urgency !== 'critical';
    const message = activeTooLong ? `The current session timer shows about ${momentum.activeMinutes} minutes. If you’ve been working continuously, save your place and take a short break.` : deferred ? 'You set aside the current suggestions. Those tasks are still outstanding; I’ll bring back anything that becomes critical.' : mentorMessage(priorities, state.plan.energy, unavailable.length > 0);
    return {
      generatedAt: now.toISOString(), timeZone: clock.timeZone, preferences: state.preferences, proactiveAllowed,
      planInput: state.plan, planConfirmed: state.planConfirmed, status: unavailable.length ? 'partial' : 'ready', unavailable,
      message, mood: lead?.urgency === 'critical' || lead?.urgency === 'high' ? 'urgent' : activeTooLong ? 'waiting' : state.plan.energy === 'low' ? 'encouraging' : !lead && momentum.completedToday > 0 ? 'celebrating' : lead ? 'pointing' : 'waiting',
      priorities, resources, plan: buildMentorPlan(priorities, state.plan, localDateKey(now, clock.timeZone), clock.timeZone),
      nextCheck: lead?.deadlineAt ?? null, momentum,
      learning: reflection ? { solid: reflection.map.coverage.solid ?? 0, needsPractice: reflection.map.coverage.shaky ?? 0, untouched: reflection.map.coverage.untouched ?? 0, evidenceCurrent: !reflection.stale } : null,
    };
  }

  private async reading(principal: InstitutionalStudentPrincipal) {
    if (!principal.permissions.includes('*') && !principal.permissions.includes('student.classes.view')) return [];
    const [materials, sources] = await Promise.all([
      this.materials.list(principal),
      this.db.select({ origin: schema.knowledgeItems.origin, pageCount: schema.knowledgeItems.pageCount }).from(schema.knowledgeItems).where(and(eq(schema.knowledgeItems.institutionId, principal.institutionId), eq(schema.knowledgeItems.studentId, principal.studentId), eq(schema.knowledgeItems.extractedTextReady, true))),
    ]);
    return materials.items.map((item) => ({ id: item.id, title: item.title, subject: item.subjectName, pageCount: sources.find((source) => source.origin.classMaterialId === item.id)?.pageCount ?? null }));
  }

  private async momentum(principal: InstitutionalStudentPrincipal, timeZone: string, now: Date) {
    const rows = await this.db.select({ status: schema.petrosLearningSessions.status, closeReason: schema.petrosLearningSessions.closeReason, closedAt: schema.petrosLearningSessions.closedAt, updatedAt: schema.petrosLearningSessions.updatedAt, elapsed: schema.petrosLearningSessions.elapsedSeconds, activeSince: schema.petrosLearningSessions.activeSince }).from(schema.petrosLearningSessions).where(and(eq(schema.petrosLearningSessions.institutionId, principal.institutionId), eq(schema.petrosLearningSessions.studentId, principal.studentId), gte(schema.petrosLearningSessions.updatedAt, new Date(now.getTime() - 30 * 86_400_000)))).orderBy(desc(schema.petrosLearningSessions.updatedAt)).limit(100);
    const today = localDateKey(now, timeZone);
    const completed = rows.filter((row) => row.closedAt && localDateKey(row.closedAt, timeZone) === today);
    const active = rows.find((row) => row.status === 'active');
    return { completedToday: completed.filter((row) => row.closeReason === 'goal_met').length, practicedMinutesToday: Math.floor(completed.reduce((sum, row) => sum + row.elapsed, 0) / 60), activeMinutes: recentActiveMinutes(active, now), lastActivityAt: rows[0]?.updatedAt.toISOString() ?? null };
  }
}
