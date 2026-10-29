import { Inject, Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { and, desc, eq, schema, sql, type Database } from '@edrion/database';
import { m3ProposalSchema, M3_MODEL_VERSION, type M3Proposal } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
/** Append proposal revisions to the existing durable preparation owner, never overwrite history. */
@Injectable()
export class PetrosLearningProposalRepository {
  constructor(@Inject(DATABASE) private readonly db:Database) {}
  lock(institutionId:string,id:string) {
    return this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`m3:${institutionId}:${id}`},0))`);
  }
  async revisions(institutionId:string,id:string) {
    const t=schema.petrosDocumentPreparations;
    const rows=await this.db.select().from(t).where(and(eq(t.institutionId,institutionId),eq(t.requestedConceptId,id),eq(t.generatorVersion,M3_MODEL_VERSION)))
      .orderBy(desc(t.createdAt)).limit(100);
    return rows.map(r=>m3ProposalSchema.parse(r.documentMap)).sort((a,b)=>b.version-a.version);
  }
  async current(institutionId:string,id:string) {
    const p=(await this.revisions(institutionId,id))[0];
    if(!p) throw new NotFoundException('M3_PROPOSAL_UNAVAILABLE'); return p;
  }
  async command(institutionId:string,commandId:string) {
    const t=schema.petrosDocumentPreparations;
    const [r]=await this.db.select().from(t).where(and(eq(t.institutionId,institutionId),eq(t.generatorVersion,M3_MODEL_VERSION),
      sql`${t.requestContext}->>'commandId'=${commandId}`)).limit(1);
    return r?.documentMap?m3ProposalSchema.parse(r.documentMap):null;
  }
  async append(p:M3Proposal,timing:Record<string,number>={}) {
    const parsed=m3ProposalSchema.parse(p);
    if(Buffer.byteLength(JSON.stringify(parsed))>96*1024) throw new ConflictException('M3_DRAFT_LIMIT');
    await this.db.insert(schema.petrosDocumentPreparations).values({institutionId:p.institutionId,sourceRevisionId:p.source.revisionId,
      requestedConceptId:p.id,generatorVersion:M3_MODEL_VERSION,curriculumKey:`m3:${p.classId}:${p.subjectId}:${p.version}`,
      requestContext:{commandId:p.correction.commandId,requestHash:p.correction.requestHash,actorId:p.correction.editorId},
      status:p.state,stage:'ready_for_review',progress:100,message:'Source organization prepared. Semantics require review.',
      documentMap:parsed as unknown as Record<string,unknown>,completedAt:new Date(),timing,tokenUsage:{}});
    return parsed;
  }
}
