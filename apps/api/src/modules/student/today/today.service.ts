import { createHash } from 'node:crypto';
import type { AnyColumn } from 'drizzle-orm';
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gt, inArray, lte, lt, or, schema, sql, type Database } from '@edrion/database';
import {
  mergeObligations,
  normalizeObligationKind,
  obligationSchema,
  type CreateUserObligationInput,
  type Obligation,
  type UpdateTodayPreferencesInput,
  type UpdateUserObligationInput,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import { StudentPortalConfigService } from '../../portal/student-portal-config.service';
import type { StudentPrincipal } from '../student.types';
import { StudentHomeService } from '../home/student-home.service';

type Provider = { key: string; sourceModule: string; load: () => Promise<Obligation[]> };

@Injectable()
export class TodayService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly features: FeatureControlsService,
    private readonly portalConfig: StudentPortalConfigService,
    private readonly home: StudentHomeService,
  ) {}

  async getToday(principal: StudentPrincipal) {
    await this.assertTodayEnabled(principal);
    const config = await this.portalConfig.getForStudent(principal);
    const visible = new Set<string>(config.modules.map((module) => module.key));
    const [preferences, reviewDueCount, timezone, ribbonEnabled, nudgeFlag, todayConfig] = await Promise.all([
      this.preferences(principal), this.reviewDueCount(principal), this.timezone(principal),
      this.flagEnabled(principal, 'student.today.status_ribbon', true),
      this.flagEnabled(principal, 'student.today.petros_nudge', true),
      this.todayConfig(principal),
    ]);
    const providers: Provider[] = [
      { key: 'self', sourceModule: 'learn', load: () => this.selfObligations(principal) },
      { key: 'assignments', sourceModule: 'learn', load: () => principal.kind === 'institutional' ? this.assignmentObligations(principal, config.terminology.homework_word ?? 'Work') : Promise.resolve([]) },
      { key: 'fees', sourceModule: 'fees', load: () => principal.kind === 'institutional' ? this.feeObligations(principal, config.terminology.fee_word ?? 'Fees') : Promise.resolve([]) },
      { key: 'exams', sourceModule: 'results', load: () => principal.kind === 'institutional' ? this.examObligations(principal, config.terminology.exam_word ?? 'Exam') : Promise.resolve([]) },
      { key: 'review', sourceModule: 'library', load: () => Promise.resolve(reviewDueCount ? [this.reviewObligation(reviewDueCount)] : []) },
    ];
    const active = providers.filter((provider) => principal.kind === 'independent' || provider.key === 'self' || visible.has(provider.sourceModule));
    const settled = await Promise.all(active.map(async (provider) => {
      try {
        const rows = await this.withTimeout(provider.load(), 800);
        return { key: provider.key, rows: rows.map((row) => obligationSchema.parse({ ...row, kind: normalizeObligationKind(String(row.kind)) })) };
      } catch { return { key: provider.key, rows: null }; }
    }));
    const missing = settled.filter((item) => item.rows === null).map((item) => item.key);
    const merged = mergeObligations(settled.flatMap((item) => item.rows ?? [])).slice(0, 30);
    const dismissed = new Set(preferences.ribbonDismissedIds);
    const attendanceWarning=principal.kind==='institutional'&&visible.has('attendance')?await this.attendanceWarning(principal):null;
    const ribbonCandidates=attendanceWarning?[attendanceWarning,...merged]:merged;
    const ribbon = ribbonEnabled ? ribbonCandidates.filter((item) => !dismissed.has(item.id) && (item.urgency_override === 'ribbon' || this.autoRibbon(item, todayConfig.ribbonFeeDays))).slice(0, 3) : [];
    const hero = await this.hero(principal, config.terminology.exam_word ?? 'Exam', timezone);
    const chips = await this.chips(principal, preferences.homeStatChips, visible, reviewDueCount);
    const nudge = nudgeFlag && todayConfig.nudgesEnabled ? await this.nudge(principal, preferences, merged, reviewDueCount, timezone) : null;
    const payload = { generated_at: new Date().toISOString(), timezone, ribbon, hero, due: merged, chips, nudge, partial: missing.length > 0, missing_modules: missing };
    const etag = `"${createHash('sha256').update(JSON.stringify({ ...payload, generated_at: undefined })).digest('hex')}"`;
    return { payload, etag };
  }

  async feed(principal: StudentPrincipal, cursor?: string) {
    await this.assertTodayEnabled(principal);
    const config = await this.portalConfig.getForStudent(principal);
    const visible = new Set<string>(config.modules.map((module) => module.key));
    let parsed = cursor ? this.decodeCursor(cursor) : null;
    const owner = this.ownerWhere(principal, schema.feedEvents);
    const items: Array<typeof schema.feedEvents.$inferSelect> = [];
    let more = false;
    // Invisible-module events must not create a false end-of-feed. Walk bounded keyset pages until
    // twenty visible rows are found (or the source is exhausted).
    for (let page = 0; page < 10 && items.length < 21; page += 1) {
      const cursorWhere = parsed ? or(lt(schema.feedEvents.occurredAt, parsed.at), and(eq(schema.feedEvents.occurredAt, parsed.at), lt(schema.feedEvents.id, parsed.id))) : undefined;
      const rows = await this.db.select().from(schema.feedEvents).where(and(owner, cursorWhere)).orderBy(desc(schema.feedEvents.occurredAt), desc(schema.feedEvents.id)).limit(50);
      if (!rows.length) break;
      items.push(...rows.filter((row) => principal.kind === 'independent' || visible.has(row.sourceModule)));
      const tail = rows.at(-1)!;
      parsed = { at: tail.occurredAt, id: tail.id };
      more = rows.length === 50;
      if (!more) break;
    }
    const pageItems = items.slice(0, 20);
    const last = pageItems.at(-1);
    return { items: pageItems, nextCursor: (items.length > 20 || more) && last ? this.encodeCursor(last.occurredAt, last.id) : null };
  }

  async createObligation(principal: StudentPrincipal, input: CreateUserObligationInput, key?: string) {
    if (!key) throw new ConflictException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key is required.' });
    const owner = this.ownerValues(principal);
    const [existing] = await this.db.select().from(schema.userObligations).where(and(this.ownerWhere(principal), eq(schema.userObligations.idempotencyKey, key))).limit(1);
    if (existing) return existing;
    const [row] = await this.db.insert(schema.userObligations).values({
      ...owner, source: 'self', kind: input.kind, title: input.title, dueAt: new Date(input.due_at), allDay: input.all_day,
      deepLink: input.deep_link, idempotencyKey: key,
    }).returning();
    return row;
  }

  async updateObligation(principal: StudentPrincipal, id: string, input: UpdateUserObligationInput) {
    const [row] = await this.db.update(schema.userObligations).set({
      title: input.title, dueAt: input.due_at ? new Date(input.due_at) : undefined, allDay: input.all_day,
      deepLink: input.deep_link, status: input.status, doneAt: input.status === 'done' ? new Date() : undefined,
      version: input.version + 1, updatedAt: new Date(),
    }).where(and(eq(schema.userObligations.id, id), this.ownerWhere(principal), eq(schema.userObligations.version, input.version))).returning();
    if (!row) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'This obligation changed. Refresh and retry.' });
    return row;
  }

  async dismissObligation(principal: StudentPrincipal, id: string) {
    if (id.startsWith('institution:')) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    const rawId = id.startsWith('self:uo:') ? id.slice('self:uo:'.length) : id;
    const [row] = await this.db.update(schema.userObligations).set({ status: 'dismissed', version: sql`${schema.userObligations.version}+1`, updatedAt: new Date() })
      .where(and(eq(schema.userObligations.id, rawId), this.ownerWhere(principal))).returning();
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    return { dismissed: true };
  }

  async getPreferences(principal: StudentPrincipal) { return this.preferences(principal); }

  async updatePreferences(principal: StudentPrincipal, input: UpdateTodayPreferencesInput) {
    const current = await this.preferences(principal);
    const [row] = await this.db.insert(schema.todayPreferences).values({
      ...this.ownerValues(principal), homeStatChips: input.home_stat_chips ?? current.homeStatChips,
      moduleNotifications: input.module_notifications ?? current.moduleNotifications,
      ribbonDismissedIds: input.ribbon_dismissed_ids ?? current.ribbonDismissedIds,
      quietHoursOverride: input.quiet_hours_override ?? current.quietHoursOverride, version: input.version + 1,
    }).onConflictDoUpdate({
      target: principal.kind === 'institutional' ? schema.todayPreferences.studentId : schema.todayPreferences.independentUserId,
      targetWhere: principal.kind === 'institutional' ? sql`${schema.todayPreferences.studentId} is not null` : sql`${schema.todayPreferences.independentUserId} is not null`,
      set: { homeStatChips: input.home_stat_chips ?? current.homeStatChips, moduleNotifications: input.module_notifications ?? current.moduleNotifications, ribbonDismissedIds: input.ribbon_dismissed_ids ?? current.ribbonDismissedIds, quietHoursOverride: input.quiet_hours_override ?? current.quietHoursOverride, version: input.version + 1, updatedAt: new Date() },
      setWhere: eq(schema.todayPreferences.version, input.version),
    }).returning();
    if (!row) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Today settings changed. Refresh and retry.' });
    return row;
  }

  async expireObligations() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.db.update(schema.userObligations).set({ status: 'expired', updatedAt: new Date(), version: sql`${schema.userObligations.version}+1` })
      .where(and(eq(schema.userObligations.status, 'pending'), lt(schema.userObligations.dueAt, cutoff))).returning({ id: schema.userObligations.id });
  }

  private async selfObligations(principal: StudentPrincipal): Promise<Obligation[]> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); const horizon = new Date(Date.now() + 14 * 86_400_000);
    const rows = await this.db.select().from(schema.userObligations).where(and(this.ownerWhere(principal), lte(schema.userObligations.dueAt, horizon), gt(schema.userObligations.dueAt, cutoff), inArray(schema.userObligations.status, ['pending','done']))).orderBy(asc(schema.userObligations.dueAt)).limit(50);
    return rows.map((row) => ({ id:`self:uo:${row.id}`,origin:'self',kind:row.kind==='review'?'review_queue':this.safeKind(row.kind),title:row.title,due_at:row.dueAt.toISOString(),all_day:row.allDay,status:row.status as Obligation['status'],action:{label:row.kind==='review'?'Review':'Open',deep_link:row.deepLink ?? this.defaultLink(row.kind)},source_module:row.kind==='review'?'library':'learn',updated_at:row.updatedAt.toISOString(),version:row.version }));
  }

  private async assignmentObligations(principal: Extract<StudentPrincipal,{kind:'institutional'}>, noun: string): Promise<Obligation[]> {
    const horizon = new Date(Date.now()+14*86_400_000).toISOString().slice(0,10); const cutoff = new Date(Date.now()-24*86_400_000).toISOString().slice(0,10);
    const rows = await this.db.select({ id:schema.assignments.id,title:schema.assignments.title,due:schema.assignments.dueDate,updatedAt:schema.assignments.updatedAt })
      .from(schema.assignmentSubmissions).innerJoin(schema.assignments,eq(schema.assignments.id,schema.assignmentSubmissions.assignmentId))
      .where(and(eq(schema.assignmentSubmissions.studentId,principal.studentId),inArray(schema.assignmentSubmissions.status,['assigned','late']),eq(schema.assignments.status,'published'),gt(schema.assignments.dueDate,cutoff),lte(schema.assignments.dueDate,horizon))).limit(50);
    return rows.filter((row)=>row.due).map((row)=>({id:`institution:assignment:${row.id}`,origin:'institution',kind:'assignment',title:row.title,subtitle:noun,due_at:`${row.due}T23:59:00.000Z`,all_day:true,status:'pending',action:{label:'Open',deep_link:`/assignments/${row.id}`},source_module:'learn',updated_at:row.updatedAt.toISOString()}));
  }

  private async feeObligations(principal: Extract<StudentPrincipal,{kind:'institutional'}>, noun: string): Promise<Obligation[]> {
    const horizon = new Date(Date.now()+14*86_400_000).toISOString().slice(0,10); const cutoff = new Date(Date.now()-24*86_400_000).toISOString().slice(0,10);
    const rows = await this.db.select().from(schema.feeInvoices).where(and(eq(schema.feeInvoices.studentId,principal.studentId),gt(schema.feeInvoices.dueDate,cutoff),lte(schema.feeInvoices.dueDate,horizon),inArray(schema.feeInvoices.status,['pending','partial','overdue']))).orderBy(asc(schema.feeInvoices.dueDate)).limit(50);
    return rows.filter((row)=>row.dueDate && row.amount>row.amountPaid).map((row)=>({id:`institution:fee:${row.id}`,origin:'institution',kind:'fee_installment',title:`${noun} · ${this.money(row.amount-row.amountPaid)}`,subtitle:row.invoiceNo,due_at:`${row.dueDate}T23:59:00.000Z`,all_day:true,status:'pending',action:{label:'Pay',deep_link:'/fees'},source_module:'fees',updated_at:row.updatedAt.toISOString()}));
  }

  private async examObligations(principal: Extract<StudentPrincipal,{kind:'institutional'}>, noun: string): Promise<Obligation[]> {
    const [student]=await this.db.select({classId:schema.students.classId}).from(schema.students).where(eq(schema.students.id,principal.studentId)).limit(1); if(!student?.classId)return[];
    const horizon=new Date(Date.now()+14*86_400_000).toISOString().slice(0,10);const cutoff=new Date(Date.now()-24*86_400_000).toISOString().slice(0,10);
    const rows=await this.db.select({id:schema.examSchedules.id,date:schema.examSchedules.examDate,time:schema.examSchedules.startTime,room:schema.examSchedules.room,subject:schema.subjects.name,updatedAt:schema.examSchedules.updatedAt}).from(schema.examSchedules).leftJoin(schema.subjects,eq(schema.subjects.id,schema.examSchedules.subjectId)).where(and(eq(schema.examSchedules.classId,student.classId),eq(schema.examSchedules.published,true),gt(schema.examSchedules.examDate,cutoff),lte(schema.examSchedules.examDate,horizon))).limit(50);
    return rows.filter((row)=>row.date).map((row)=>({id:`institution:exam:${row.id}`,origin:'institution',kind:'exam',title:row.subject??noun,subtitle:[row.time,row.room].filter(Boolean).join(' · '),due_at:`${row.date}T${row.time??'09:00'}:00.000Z`,all_day:false,status:'pending',action:{label:'Open',deep_link:'/exams'},source_module:'results',updated_at:row.updatedAt.toISOString()}));
  }

  private reviewObligation(count:number):Obligation{return{id:`self:review_queue:${new Date().toISOString().slice(0,10)}`,origin:'self',kind:'review_queue',title:`${count} cards ready to review`,due_at:`${new Date().toISOString().slice(0,10)}T23:59:00.000Z`,all_day:true,status:'pending',action:{label:`Review ${count} cards`,deep_link:'/library'},progress:{current:0,total:count},source_module:'library',updated_at:new Date().toISOString()};}

  private async hero(principal:StudentPrincipal,examNoun:string,timezone:string){if(principal.kind==='independent')return{type:'idle',title:'Shape your day',body:'Choose one useful next step.',actions:[{label:'Open your plan',deep_link:'/learn'}]};const exams=await this.examObligations(principal,examNoun);const localDate=this.localDate(new Date(),timezone);const today=exams.find((e)=>e.due_at.slice(0,10)===localDate);if(today)return{type:'exam_day',title:today.title,body:today.subtitle??examNoun,deep_link:today.action.deep_link,actions:[{label:'Quick revision (20 min)',deep_link:'/learn'}]};const schedule=await this.home.todaySchedule(principal);const minute=this.localMinute(new Date(),timezone);const current=schedule.find(row=>this.hhmm(row.startTime)<=minute&&minute<this.hhmm(row.endTime));if(current){const next=schedule.find(row=>this.hhmm(row.startTime)>minute);return{type:'in_class',title:current.title,body:[current.room?`Room ${current.room}`:null,next?`Next: ${next.title} · ${next.time}`:null].filter(Boolean).join(' · '),deep_link:'/calendar'};}const next=schedule.find(row=>this.hhmm(row.startTime)>minute);if(next)return{type:'next_class',title:next.title,body:[next.time,next.room?`Room ${next.room}`:null].filter(Boolean).join(' · '),deep_link:'/calendar'};const tomorrow=await this.home.todaySchedule(principal,new Date(Date.now()+86_400_000));if(tomorrow[0])return{type:'next_class',title:tomorrow[0].title,body:`Tomorrow ${tomorrow[0].time}${tomorrow[0].room?` · Room ${tomorrow[0].room}`:''}`,deep_link:'/calendar'};return{type:'idle',title:'Nothing urgent today',body:'A good day to review or continue learning.',actions:[{label:'Review cards',deep_link:'/library'},{label:'Continue learning',deep_link:'/learn'}]};}

  private async chips(principal:StudentPrincipal,picked:string[],visible:Set<string>,reviewCount:number){const defaults=principal.kind==='independent'?['streak','review_due_count','mock_percentile']:['attendance_pct','gpa_term','streak'];const keys=(picked.length?picked:defaults).slice(0,3);const result:Array<Record<string,unknown>>=[];for(const key of keys){if(key==='review_due_count'&&(principal.kind==='independent'||visible.has('library')))result.push({key,label:'Review due',value:reviewCount,deep_link:'/library',tone:'neutral'});if(key==='fees_balance'&&principal.kind==='institutional'&&visible.has('fees')){const [r]=await this.db.select({value:sql<number>`coalesce(sum(${schema.feeInvoices.amount}-${schema.feeInvoices.amountPaid}),0)`}).from(schema.feeInvoices).where(and(eq(schema.feeInvoices.studentId,principal.studentId),sql`${schema.feeInvoices.status}<>'cancelled'`));result.push({key,label:'Balance',value:this.money(Number(r?.value??0)),deep_link:'/fees',tone:'amber'});}if(key==='attendance_pct'&&principal.kind==='institutional'&&visible.has('attendance')){const [r]=await this.db.select({total:sql<number>`count(*)::int`,present:sql<number>`count(*) filter (where ${schema.attendanceRecords.status} in ('present','late','left_early'))::int`}).from(schema.attendanceRecords).where(and(eq(schema.attendanceRecords.studentId,principal.studentId),sql`${schema.attendanceRecords.status}<>'excused'`));const pct=Number(r?.total??0)?Math.round(Number(r?.present??0)*100/Number(r!.total)):0;if(Number(r?.total??0)>0)result.push({key,label:'Attendance',value:`${pct}%`,deep_link:'/analytics',tone:pct<75?'red':pct<80?'amber':'green'});}if(key==='gpa_term'&&principal.kind==='institutional'&&visible.has('results')){const [r]=await this.db.select({pct:sql<number>`coalesce(round(sum(${schema.gradeEntries.marksObtained})::numeric*100/nullif(sum(${schema.gradeEntries.maxMarks}),0)),0)`}).from(schema.gradeEntries).where(and(eq(schema.gradeEntries.studentId,principal.studentId),eq(schema.gradeEntries.published,true)));result.push({key,label:'Published average',value:`${Number(r?.pct??0)}%`,deep_link:'/report-cards',tone:'neutral'});}if(key==='streak')result.push({key,label:'Streak',value:'Keep going',deep_link:'/history',tone:'green'});}return result;}

  private async nudge(principal:StudentPrincipal,prefs:typeof schema.todayPreferences.$inferSelect|ReturnType<TodayService['defaultPreferences']>,obligations:Obligation[],reviews:number,timezone:string){if(prefs.lastNudgeAt&&Date.now()-prefs.lastNudgeAt.getTime()<86_400_000)return null;const signal=obligations.find((o)=>o.kind==='exam')??(reviews>=15?this.reviewObligation(reviews):null);if(!signal)return null;const now=new Date();const minute=this.localMinute(now,timezone);const quiet=prefs.quietHoursOverride??{start:'22:00',end:'06:00'};const start=this.hhmm(quiet.start),end=this.hhmm(quiet.end);if(start>end?(minute>=start||minute<end):(minute>=start&&minute<end))return null;const [claimed]=await this.db.update(schema.todayPreferences).set({lastNudgeAt:now,updatedAt:now}).where(and(this.ownerWhere(principal,schema.todayPreferences),or(sql`${schema.todayPreferences.lastNudgeAt} is null`,lt(schema.todayPreferences.lastNudgeAt,new Date(Date.now()-86_400_000))))).returning();if(!claimed){const [created]=await this.db.insert(schema.todayPreferences).values({...this.ownerValues(principal),lastNudgeAt:now}).onConflictDoNothing().returning();if(!created)return null;}return{id:`nudge:${signal.id}`,title:signal.kind==='exam'?`${signal.title} is coming up`:`${reviews} reviews are ready`,body:'A focused 20-minute step is ready.',action:{label:'Start',deep_link:signal.action.deep_link},signal_id:signal.id};}

  private async reviewDueCount(principal:StudentPrincipal){const owner=principal.kind==='institutional'?eq(schema.flashcardDecks.studentId,principal.studentId):eq(schema.flashcardDecks.independentUserId,principal.independentUserId);const [row]=await this.db.select({count:sql<number>`count(*)::int`}).from(schema.flashcards).innerJoin(schema.flashcardDecks,eq(schema.flashcards.deckId,schema.flashcardDecks.id)).where(and(owner,lte(schema.flashcards.nextDueAt,new Date())));return Number(row?.count??0);}
  private async attendanceWarning(principal:Extract<StudentPrincipal,{kind:'institutional'}>):Promise<Obligation|null>{const[[counts],setting]=await Promise.all([this.db.select({total:sql<number>`count(*)::int`,present:sql<number>`count(*) filter (where ${schema.attendanceRecords.status} in ('present','late','left_early'))::int`}).from(schema.attendanceRecords).where(and(eq(schema.attendanceRecords.studentId,principal.studentId),sql`${schema.attendanceRecords.status}<>'excused'`)),this.db.select({value:schema.institutionSettings.value}).from(schema.institutionSettings).where(and(eq(schema.institutionSettings.institutionId,principal.institutionId),eq(schema.institutionSettings.category,'student_portal'),eq(schema.institutionSettings.key,'attendance_threshold'))).limit(1).then(rows=>rows[0])]);const total=Number(counts?.total??0);if(!total)return null;const pct=Math.round(Number(counts?.present??0)*100/total),threshold=Number(setting?.value??75);if(pct>=threshold)return null;return{id:`institution:attendance-threshold:${threshold}`,origin:'institution',kind:'custom',title:`Attendance is ${pct}% · below the ${threshold}% threshold`,due_at:new Date(Date.now()+86_400_000).toISOString(),all_day:true,status:'pending',action:{label:'View attendance',deep_link:'/analytics'},urgency_override:'ribbon',source_module:'attendance',updated_at:new Date().toISOString()};}
  private async preferences(principal:StudentPrincipal){const [row]=await this.db.select().from(schema.todayPreferences).where(this.ownerWhere(principal,schema.todayPreferences)).limit(1);return row??this.defaultPreferences(principal);}
  private defaultPreferences(principal:StudentPrincipal){return{id:'',institutionId:principal.kind==='institutional'?principal.institutionId:null,studentId:principal.kind==='institutional'?principal.studentId:null,independentUserId:principal.kind==='independent'?principal.independentUserId:null,homeStatChips:[],moduleNotifications:{},ribbonDismissedIds:[],lastNudgeAt:null,quietHoursOverride:null,heldNotificationEvents:[],quietReleaseAt:null,version:0,createdAt:new Date(0),updatedAt:new Date(0)};}
  private ownerWhere(principal:StudentPrincipal,columns:{studentId:AnyColumn;independentUserId:AnyColumn}=schema.userObligations){return principal.kind==='institutional'?eq(columns.studentId,principal.studentId):eq(columns.independentUserId,principal.independentUserId);}
  private ownerValues(principal:StudentPrincipal){return principal.kind==='institutional'?{institutionId:principal.institutionId,studentId:principal.studentId,independentUserId:null}:{institutionId:null,studentId:null,independentUserId:principal.independentUserId};}
  private async assertTodayEnabled(principal:StudentPrincipal){try{const r=await this.features.resolveByKey('student.surface.today',principal.kind==='institutional'?{institutionId:principal.institutionId,campusId:principal.campusId??undefined,institutionUserId:principal.institutionUserId}:{independentUserId:principal.independentUserId});if(!r.value)throw new ForbiddenException({code:'MODULE_DISABLED',module:'today'});}catch(e){if(e instanceof NotFoundException)return;throw e;}}
  private async timezone(principal:StudentPrincipal){if(principal.kind==='independent')return 'UTC';const [row]=await this.db.select().from(schema.institutionSettings).where(and(eq(schema.institutionSettings.institutionId,principal.institutionId),eq(schema.institutionSettings.category,'localization'),eq(schema.institutionSettings.key,'timezone'))).limit(1);return row?.value??'UTC';}
  private safeKind(kind:string):Obligation['kind']{return ['study_block','mock','custom'].includes(kind)?kind as Obligation['kind']:'custom';}
  private defaultLink(kind:string){return kind==='mock'?'/lab':kind==='review'?'/library':'/calendar';}
  private autoRibbon(item:Obligation,feeDays:number){return item.kind==='fee_installment'&&Date.parse(item.due_at)-Date.now()<=feeDays*86_400_000||item.kind==='exam'&&item.due_at.slice(0,10)===new Date(Date.now()+86_400_000).toISOString().slice(0,10);}
  private async flagEnabled(principal:StudentPrincipal,key:string,fallback:boolean){try{return(await this.features.resolveByKey(key,principal.kind==='institutional'?{institutionId:principal.institutionId,campusId:principal.campusId??undefined,institutionUserId:principal.institutionUserId}:{independentUserId:principal.independentUserId})).value;}catch{return fallback;}}
  private async todayConfig(principal:StudentPrincipal){if(principal.kind==='independent')return{ribbonFeeDays:3,nudgesEnabled:true};const rows=await this.db.select().from(schema.institutionSettings).where(and(eq(schema.institutionSettings.institutionId,principal.institutionId),eq(schema.institutionSettings.category,'today'),inArray(schema.institutionSettings.key,['ribbon_fee_days','nudges_enabled'])));const map=new Map(rows.map(r=>[r.key,r.value]));return{ribbonFeeDays:Number(map.get('ribbon_fee_days')??3),nudgesEnabled:map.get('nudges_enabled')!=='false'};}
  private money(value:number){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(value/100);}
  private hhmm(value:string){const[h,m]=value.split(':').map(Number);return h!*60+m!;}
  private localMinute(date:Date,timezone:string){try{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);return Number(parts.find(part=>part.type==='hour')?.value??0)*60+Number(parts.find(part=>part.type==='minute')?.value??0);}catch{return date.getUTCHours()*60+date.getUTCMinutes();}}
  private localDate(date:Date,timezone:string){try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return `${parts.find(part=>part.type==='year')?.value}-${parts.find(part=>part.type==='month')?.value}-${parts.find(part=>part.type==='day')?.value}`;}catch{return date.toISOString().slice(0,10);}}
  private withTimeout<T>(promise:Promise<T>,ms:number){return Promise.race<T>([promise,new Promise<T>((_,reject)=>setTimeout(()=>reject(new Error('provider timeout')),ms))]);}
  private encodeCursor(at:Date,id:string){return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');}
  private decodeCursor(cursor:string){const [at,id]=Buffer.from(cursor,'base64url').toString().split('|');if(!at||!id)throw new ConflictException({code:'BAD_CURSOR',message:'Invalid cursor.'});return{at:new Date(at),id};}
}
