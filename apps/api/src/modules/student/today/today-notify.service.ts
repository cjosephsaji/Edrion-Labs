import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { and, eq, inArray, runInInstitutionTenant, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { JobTracker } from '../../../common/queue/job-tracker.service';
import { WebPushChannel } from '../../parent-portal/notification-channels';
import type { StudentPrincipal } from '../student.types';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';

export const TODAY_QUIET_RELEASE_JOB = 'today.quiet_hours.release';
export const TODAY_FANOUT_JOB = 'today.feed.fanout';

export interface TodayNotificationEvent {
  eventKey: string; type: 'announcement'|'marks_released'|'request_update'|'club_event'|'nudge';
  sourceModule: string; title: string; body: string; deepLink: string; emergency?: boolean;
}

/** Writes the feed record first, then applies module toggles, quiet hold/coalescing and push. */
@Injectable()
export class TodayNotifyService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly push: WebPushChannel,
    private readonly features: FeatureControlsService,
  ) {}

  onModuleInit() {
    this.workers.register(TODAY_QUIET_RELEASE_JOB, (job: Job) => this.tracker.run(TODAY_QUIET_RELEASE_JOB, 'notifications', async () => {
      const delivered = await this.release(job.data as { preferenceId: string });
      return { itemsProcessed: delivered };
    }));
    this.workers.register(TODAY_FANOUT_JOB,(job:Job)=>this.tracker.run(TODAY_FANOUT_JOB,'notifications',async()=>{const data=job.data as {institutionId:string;studentIds:string[];event:TodayNotificationEvent};const delivered=await runInInstitutionTenant(this.db,data.institutionId,()=>this.deliverStudents(data.institutionId,data.studentIds,data.event));return{itemsProcessed:delivered};}));
  }

  async fanoutInstitutionStudents(institutionId:string,studentIds:string[],event:TodayNotificationEvent){const unique=[...new Set(studentIds)];for(let offset=0;offset<unique.length;offset+=100){const ids=unique.slice(offset,offset+100);await this.jobs.enqueue('notifications',TODAY_FANOUT_JOB,{institutionId,studentIds:ids,event},{jobId:`today-fanout:${event.eventKey}:${offset/100}`});}return{queued:unique.length};}

  async dispatch(principal: StudentPrincipal, event: TodayNotificationEvent) {
    // AC-12: exactly zero push notifications may originate from Learn in P1.
    if (event.sourceModule === 'learn') {
      return { eventWritten: false, push: 'learn_push_forbidden' as const };
    }
    try{const visible=await this.features.resolveByKey(`student.surface.${event.sourceModule}`,principal.kind==='institutional'?{institutionId:principal.institutionId,campusId:principal.campusId??undefined,institutionUserId:principal.institutionUserId}:{independentUserId:principal.independentUserId});if(!visible.value)return{eventWritten:false,push:'module_disabled' as const};}catch{/* Writers for non-surface system events retain their feed contract. */}
    const owner = principal.kind === 'institutional'
      ? { institutionId: principal.institutionId, studentId: principal.studentId, independentUserId: null }
      : { institutionId: null, studentId: null, independentUserId: principal.independentUserId };
    const inserted = await this.db.insert(schema.feedEvents).values({
      ...owner, eventKey: event.eventKey, type: event.type, sourceModule: event.sourceModule,
      title: event.title, body: event.body.slice(0, 200), deepLink: event.deepLink, occurredAt: new Date(),
    }).onConflictDoNothing().returning({ id: schema.feedEvents.id });
    if (!inserted.length) return { eventWritten: false, push: 'duplicate' as const };
    const preference = await this.ensurePreferences(principal);
    if (preference.moduleNotifications[event.sourceModule] === false) return { eventWritten: true, push: 'disabled' as const };
    const quietConfig = principal.kind === 'institutional'
      ? await this.institutionQuietHours(principal.institutionId)
      : { quiet: preference.quietHoursOverride ?? { start: '22:30', end: '06:30' }, timezone: 'UTC' };
    if (!event.emergency && this.inQuietHours(new Date(), quietConfig.quiet, quietConfig.timezone)) {
      const releaseAt = this.nextRelease(new Date(), quietConfig.quiet.end, quietConfig.timezone);
      await this.db.update(schema.todayPreferences).set({
        heldNotificationEvents: sql`coalesce(${schema.todayPreferences.heldNotificationEvents}, '[]'::jsonb) || jsonb_build_array(${JSON.stringify({ eventKey:event.eventKey,title:event.title,body:event.body,deepLink:event.deepLink })}::jsonb)`,
        quietReleaseAt: releaseAt,
        updatedAt: new Date(),
      }).where(eq(schema.todayPreferences.id, preference.id));
      await this.jobs.enqueue('notifications', TODAY_QUIET_RELEASE_JOB, { preferenceId: preference.id }, { jobId: `today-quiet:${preference.id}:${releaseAt.toISOString().slice(0,10)}`, delay: Math.max(0, releaseAt.getTime()-Date.now()) });
      return { eventWritten: true, push: 'held' as const };
    }
    await this.push.send({ to: {}, title: event.title, body: event.body, deepLink: event.deepLink });
    return { eventWritten: true, push: 'sent' as const };
  }

  private async release(data: { preferenceId: string }) {
    const [preference] = await this.db.select().from(schema.todayPreferences).where(eq(schema.todayPreferences.id, data.preferenceId)).limit(1);
    if (!preference?.heldNotificationEvents.length) return 0;
    const events = preference.heldNotificationEvents;
    const first = events[0] as { title?: string; deepLink?: string };
    await this.push.send({ to: {}, title: `While you were away: ${first.title ?? 'new update'}${events.length>1?`, ${events.length-1} more update${events.length>2?'s':''}`:''}`, body: 'Open Today to catch up.', deepLink: first.deepLink ?? '/home' });
    await this.db.update(schema.todayPreferences).set({ heldNotificationEvents: [], quietReleaseAt: null, updatedAt: new Date() }).where(and(eq(schema.todayPreferences.id, preference.id), sql`jsonb_array_length(${schema.todayPreferences.heldNotificationEvents}) > 0`));
    return events.length;
  }

  private async deliverStudents(institutionId:string,studentIds:string[],event:TodayNotificationEvent){const students=await this.db.select({studentId:schema.students.id,campusId:schema.students.campusId,userId:schema.students.institutionUserId,email:schema.institutionUsers.email,fullName:schema.institutionUsers.fullName}).from(schema.students).leftJoin(schema.institutionUsers,eq(schema.institutionUsers.id,schema.students.institutionUserId)).where(and(eq(schema.students.institutionId,institutionId),inArray(schema.students.id,studentIds)));let delivered=0;for(const student of students){if(!student.userId)continue;const result=await this.dispatch({kind:'institutional',institutionId,campusId:student.campusId,institutionUserId:student.userId,studentId:student.studentId,email:student.email??'',fullName:student.fullName??'',lastAuthAt:null,permissions:[]},event);if(result.eventWritten)delivered+=1;}return delivered;}

  private async ensurePreferences(principal: StudentPrincipal) {
    const ownerWhere = principal.kind==='institutional'?eq(schema.todayPreferences.studentId,principal.studentId):eq(schema.todayPreferences.independentUserId,principal.independentUserId);
    const [row] = await this.db.select().from(schema.todayPreferences).where(ownerWhere).limit(1);
    if (row) return row;
    const [created] = await this.db.insert(schema.todayPreferences).values(principal.kind==='institutional'?{institutionId:principal.institutionId,studentId:principal.studentId}:{independentUserId:principal.independentUserId}).returning();
    return created!;
  }

  private async institutionQuietHours(institutionId:string){const rows=await this.db.select().from(schema.institutionSettings).where(and(eq(schema.institutionSettings.institutionId,institutionId),sql`(${schema.institutionSettings.category},${schema.institutionSettings.key}) in (('today','quiet_hours'),('localization','timezone'))`));const quietRow=rows.find(row=>row.category==='today');const timezone=rows.find(row=>row.category==='localization')?.value??'UTC';if(!quietRow?.value)return{quiet:{start:'22:30',end:'06:30'},timezone};try{return{quiet:JSON.parse(quietRow.value) as {start:string;end:string},timezone};}catch{return{quiet:{start:'22:30',end:'06:30'},timezone};}}

  private localMinute(date:Date,timezone:string){try{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return Number(parts.find(part=>part.type==='hour')?.value??0)*60+Number(parts.find(part=>part.type==='minute')?.value??0);}catch{return date.getUTCHours()*60+date.getUTCMinutes();}}
  private parseMinute(value:string){const[h,m]=value.split(':').map(Number);return h!*60+m!;}
  private inQuietHours(date:Date,quiet:{start:string;end:string},timezone:string){const minute=this.localMinute(date,timezone);const start=this.parseMinute(quiet.start),end=this.parseMinute(quiet.end);return start>end?minute>=start||minute<end:minute>=start&&minute<end;}
  private nextRelease(now:Date,end:string,timezone:string){const current=this.localMinute(now,timezone);const target=this.parseMinute(end);const delta=((target-current+1440)%1440)||1440;return new Date(now.getTime()+delta*60_000);}
}
