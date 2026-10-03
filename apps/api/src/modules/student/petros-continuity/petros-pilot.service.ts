import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, runInStudentTenant, schema, sql, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { AuditWriter } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import { petrosPilotEventSchema } from '@edrion/schemas';
import { API_ENV, AUDIT_WRITER, DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosContinuityService } from './petros-continuity.service';
import { releaseDigest } from '../../petros-quality/petros-release.service';

export function syntheticCohort(p: {institutionId:string;studentId:string}, experiment:string) {
  return parseInt(releaseDigest({version:'petros.cohort.v1',experiment,institutionId:p.institutionId,studentId:p.studentId}).slice(0,8),16)%2===0?'comparison':'candidate';
}
@Injectable()
export class PetrosPilotService {
  constructor(@Inject(DATABASE) private readonly db:Database,@Inject(API_ENV) private readonly env:ApiEnv,
    @Inject(AUDIT_WRITER) private readonly audit:AuditWriter,private readonly continuity:PetrosContinuityService) {}
  admission() {
    return {schemaVersion:'petros.pilot-admission.v1',admitted:false,instrumentation:false,
      code:'PETROS_PILOT_EXTERNAL_ACCEPTANCE_PENDING',required:['educator','canonical_curriculum','consent_privacy_retention','physical_accessibility','pilot_authorization'],
      guardianSharing:false,partnerDelivery:false,fullOffline:false,independentAccounts:false,generatedExecutableExtensions:false};
  }
  async recordSynthetic(p:InstitutionalStudentPrincipal,raw:unknown) {
    const parsed=petrosPilotEventSchema.safeParse(raw);
    if(!parsed.success) throw new BadRequestException({code:'PETROS_PILOT_EVENT_INVALID'});
    if(!this.env.PETROS_PILOT_SYNTHETIC_INSTRUMENTATION_ENABLED||this.env.NODE_ENV!=='test') throw new ConflictException({code:'PETROS_PILOT_INSTRUMENTATION_DISABLED'});
    const input=parsed.data,digest=releaseDigest(input);
    return runInStudentTenant(this.db,p,async()=>{
      // Only the disposable test bootstrap creates this authority. Never installed by migrations.
      const marker=await this.db.execute<{present:boolean}>(sql`select to_regprocedure('edrion_petros_synthetic_fixture()') is not null as present`);
      if(!marker[0]?.present) throw new ConflictException({code:'PETROS_PILOT_SYNTHETIC_AUTHORITY_MISSING'});
      const verified=await this.db.execute<{verified:boolean}>(sql`select edrion_petros_synthetic_fixture() as verified`);
      if(!verified[0]?.verified) throw new ConflictException({code:'PETROS_PILOT_SYNTHETIC_AUTHORITY_MISSING'});
      // Production continuity owners check enrollment, permission, source/pack and live policy.
      const journey=await this.continuity.read(p,input.journeyId);
      const context=await this.continuity.context(p,journey.returnPoint.sessionId);
      return this.continuity.fenceContext(p,context,async()=>{
        await this.db.execute(sql`select pg_advisory_xact_lock(hashtext(${`petros.pilot:${p.institutionId}:${p.studentId}`}))`);
        const t=schema.petrosPilotEvents;
        const [old]=await this.db.select().from(t).where(and(eq(t.institutionId,p.institutionId),eq(t.studentId,p.studentId),eq(t.eventId,input.eventId))).limit(1);
        if(old) {if(old.digest!==digest) throw new ConflictException({code:'PETROS_PILOT_EVENT_CONFLICT'});return {accepted:true,duplicate:true,cohort:old.cohort,synthetic:true};}
        const cohort=syntheticCohort(p,input.experiment);
        await this.db.insert(t).values({institutionId:p.institutionId,studentId:p.studentId,eventId:input.eventId,digest,experiment:input.experiment,cohort,event:input});
        await this.audit.logAudit({actorType:ActorType.InstitutionUser,actorId:p.institutionUserId,institutionId:p.institutionId,
          action:'petros.pilot.synthetic_event',module:'petros-quality',entityType:'petros_pilot_event',entityId:input.eventId,
          reason:'Explicit disposable synthetic instrumentation',newState:{event:input.event,outcome:input.outcome,synthetic:true,origin:'synthetic_client_report'}});
        return {accepted:true,duplicate:false,cohort,synthetic:true};
      });
    });
  }
}
