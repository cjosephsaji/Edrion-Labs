import { createHash, randomUUID } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { and, eq, gte, lte, asc, inArray, or, schema, sql, assertRestrictedApplicationDatabase, type Database } from '@edrion/database';
import { canonicalContent, conceptVersionPayloadSchema, contentUnitHashInput, parseBoundedContentUnit,
  sourceBindingKey, sourceBindingSchema, sourceRevisionSchema, validateUnitProvenance,
  v2Hash, v2Key, v2Uuid, type ContentUnit, type SourceRevision } from '@edrion/schemas';
import { unitSemanticIds, referenceLocatorFor } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { canAll, evaluatePermissions } from '@edrion/permissions';
import { INSTITUTION_DEFAULT_ROLES } from '@edrion/permissions/institution';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const preparationInput = z.object({ binding: sourceBindingSchema,
  kind: z.enum(['pdf', 'pptx', 'legacy_ppt', 'synthetic', 'docx', 'txt', 'markdown']), title: z.string().min(1).max(500),
  originalHash: v2Hash, representationHash: v2Hash, extractor: v2Key, interpretationVersion: v2Key,
  correctionOf: v2Uuid.nullable(), model: v2Key.nullable(), promptHash: v2Hash.nullable(),
  pageCount: z.number().int().min(0).max(10000), slideCount: z.number().int().min(0).max(10000),
  shapeRegistry: sourceRevisionSchema.innerType().shape.shapeRegistry,
  coverage: sourceRevisionSchema.innerType().shape.coverage,
  conversion: sourceRevisionSchema.innerType().shape.conversion,
  interpretationReceipt: sourceRevisionSchema.innerType().shape.interpretationReceipt,
  nativeLocators: sourceRevisionSchema.innerType().shape.nativeLocators,
  visualReceipts: sourceRevisionSchema.innerType().shape.visualReceipts,
}).strict();
export type RevisionPreparation = z.infer<typeof preparationInput>;
export type UnitLookup = { status: 'available'; revision: SourceRevision; units: ContentUnit[]; nextAfterOrdinal: number | null; truncated: boolean } |
  { status: 'unavailable'; reason: 'unauthorized_or_revoked_source' } |
  { status: 'unsupported'; reason: 'legacy_source_requires_v2_preparation' };

/** No client owner IDs, unscoped lookup, cache, provider, parser or privileged pool. */
@Injectable()
export class PetrosContentUnitRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Reuses M1's live source predicate and restricted role before touching original bytes. */
  async resolveOriginal(binding: unknown, originalHash?: string, write = false, lock = false) {
    const b = sourceBindingSchema.parse(binding);
    return this.db.transaction(async raw => {
      const tx = raw as unknown as Database, actor = await this.actor(tx, write);
      const q = tx.select().from(schema.storageObjects).where(and(eq(schema.storageObjects.id, b.objectId),
        eq(schema.storageObjects.institutionId, actor.institutionId))).limit(1);
      const [file] = await q;
      if (!file || (originalHash && file.checksumSha256 !== originalHash) || file.processingStatus !== 'ready' || file.driver !== 'local')
        throw new NotFoundException('M2_SOURCE_UNAVAILABLE');
      // Same lock order as withdrawal/publication: source owner, then original object.
      if (lock && b.kind === 'material') await tx.select({ id: schema.classMaterials.id }).from(schema.classMaterials).where(eq(schema.classMaterials.id,b.materialId)).for('share');
      if (lock && b.kind === 'guidance_attachment') await tx.select({ id: schema.assignments.id }).from(schema.assignments).where(eq(schema.assignments.id,b.assignmentId)).for('share');
      if (lock) await q.for('share');
      const [allowed] = await tx.execute<{ yes: boolean }>(sql`SELECT edrion_petros_v2_source_live(${actor.institutionId}::uuid,
        ${JSON.stringify(b)}::jsonb,${file.checksumSha256},${write}) AS yes`);
      if (!allowed?.yes) throw new NotFoundException('M2_SOURCE_UNAVAILABLE');
      return { file, actor };
    });
  }

  private async actor(tx: Database, write = false) {
    const [a] = await tx.execute<{ institution: string | null; user: string | null; student: string | null; role: string }>(sql`
      SELECT nullif(current_setting('app.institution_id',true),'') AS institution,
      nullif(current_setting('app.institution_user_id',true),'') AS "user",
      nullif(current_setting('app.student_id',true),'') AS student,current_user AS role`);
    if (!a || a.role !== 'edrion_app' || !a.institution || (!a.user && !a.student) || (write && (!a.user || a.student)))
      throw new NotFoundException('M1_AUTHENTICATED_SCOPE_REQUIRED');
    await assertRestrictedApplicationDatabase(tx);
    if (write) {
      const [user] = await tx.select().from(schema.institutionUsers).where(and(eq(schema.institutionUsers.id, a.user!), eq(schema.institutionUsers.institutionId, a.institution))).limit(1);
      if (!user || user.status !== 'active' || user.disabledAt || user.passwordResetRequiredAt) throw new NotFoundException('M1_ACTOR_UNAVAILABLE');
      const roles = await tx.select({ key: schema.institutionUserRoles.roleKey }).from(schema.institutionUserRoles).where(eq(schema.institutionUserRoles.institutionUserId, user.id));
      const custom = await tx.select().from(schema.institutionRoles).where(eq(schema.institutionRoles.institutionId, a.institution));
      const permissions = evaluatePermissions({ roleKeys: roles.map(r => r.key), directGrants: user.directGrants, directDenies: user.directDenies },
        [...INSTITUTION_DEFAULT_ROLES, ...custom.map(r => ({ key: r.key, name: r.name, description: r.description ?? '', permissions: r.permissions }))]);
      const required = ['class_content.manage', 'syllabus.manage'];
      if (!canAll(permissions, required) || required.some(p => user.directDenies.includes(p)) || user.directDenies.includes('*'))
        throw new NotFoundException('M1_WRITE_PERMISSION_REQUIRED');
    }
    return { institutionId: v2Uuid.parse(a.institution), userId: a.user, studentId: a.student };
  }

  async prepareRevision(input: unknown): Promise<SourceRevision> {
    if (Buffer.byteLength(JSON.stringify(input)) > 96 * 1024) throw new Error('M1_REVISION_BUDGET_EXCEEDED');
    const p = preparationInput.parse(input);
    return this.db.transaction(async raw => {
      const tx = raw as unknown as Database, actor = await this.actor(tx, true), t = schema.petrosDocumentSourceRevisions;
      const rootKey = p.binding.kind === 'material' ? `material:${p.binding.materialId}` : `guidance:${p.binding.objectId}:${p.binding.assignmentId}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${actor.institutionId}:${rootKey}`},0))`);
      const [allowed] = await tx.execute<{ yes: boolean }>(sql`SELECT edrion_petros_v2_source_live(${actor.institutionId}::uuid,${JSON.stringify(p.binding)}::jsonb,${p.originalHash},true) AS yes`);
      if (!allowed?.yes) throw new NotFoundException('M1_SOURCE_UNAVAILABLE');
      const documentVersion = p.binding.kind === 'material' ? p.binding.materialVersion : p.binding.publicationVersion + 1;
      const processingIdentity = `${p.extractor}/${p.interpretationVersion}${p.binding.kind === 'guidance_attachment' ? `/${p.binding.assignmentId}` : ''}`;
      const bindingPredicate = p.binding.kind === 'material'
        ? sql`${t.v2Revision}->'source'->'binding'->>'materialId'=${p.binding.materialId}`
        : sql`${t.v2Revision}->'source'->'binding'->>'objectId'=${p.binding.objectId} AND ${t.v2Revision}->'source'->'binding'->>'assignmentId'=${p.binding.assignmentId}`;
      const [original] = await tx.select({ revision: t.v2Revision }).from(t).where(and(eq(t.institutionId, actor.institutionId), eq(t.formatVersion, 'v2'), bindingPredicate)).limit(1);
      // Existing server-assigned binding UUIDs remain resolvable after an older version loses
      // current entitlement. No privileged read of a revoked revision is needed for identity.
      const sourceId = p.binding.kind === 'material' ? p.binding.materialId : p.binding.objectId;
      const [sameVersion] = await tx.select({ hash: t.checksum }).from(t).where(and(eq(t.originalSourceId, sourceId), eq(t.documentVersion, documentVersion))).limit(1);
      if (sameVersion && sameVersion.hash !== p.originalHash) throw new ConflictException('M1_SOURCE_VERSION_HASH_CONFLICT');
      const [existing] = await tx.select({ revision: t.v2Revision }).from(t).where(and(eq(t.originalSourceId, sourceId), eq(t.documentVersion, documentVersion),
        eq(t.parserVersion, processingIdentity), bindingPredicate, sql`${t.v2Revision}->'processing'->>'interpretationVersion'=${p.interpretationVersion}`)).limit(1);
      const revision = sourceRevisionSchema.parse({ schemaVersion: 'petros.v2.source-revision.v1', id: existing?.revision?.id ?? randomUUID(),
        ...(p.interpretationReceipt ? {interpretationReceipt:p.interpretationReceipt} : {}),
        ...(p.nativeLocators ? {nativeLocators:p.nativeLocators} : {}),
        ...(p.visualReceipts ? {visualReceipts:p.visualReceipts} : {}),
        source: { schemaVersion: 'petros.v2.source.v1', id: sourceId, institutionId: actor.institutionId, binding: p.binding,
          kind: p.kind, title: p.title, owner: original?.revision?.source.owner ?? { kind: 'institution_staff', userId: actor.userId }, originalHash: p.originalHash },
        processing: { extractor: p.extractor, interpretationVersion: p.interpretationVersion, schemaVersion: 'petros.v2.content.v1',
          model: p.model, promptHash: p.promptHash, correctionOf: p.correctionOf, createdBy: actor.userId },
        representationHash: p.representationHash, pageCount: p.pageCount, slideCount: p.slideCount, shapeRegistry: p.shapeRegistry, coverage: p.coverage, conversion: p.conversion });
      if (existing?.revision) {
        if (canonicalContent(existing.revision) !== canonicalContent(revision)) throw new ConflictException('M1_REVISION_RETRY_CONFLICT');
        return revision;
      }
      if (p.correctionOf) {
        const [prior] = await tx.select({ id: t.id, sourceId: t.originalSourceId, documentVersion: t.documentVersion }).from(t)
          .where(and(eq(t.id, p.correctionOf), eq(t.institutionId, actor.institutionId), eq(t.originalSourceId, sourceId), bindingPredicate)).limit(1);
        if (!prior || prior.documentVersion !== documentVersion) throw new ConflictException('M1_INVALID_CORRECTION_LINEAGE');
      }
      await tx.insert(t).values({ id: revision.id, institutionId: actor.institutionId, formatVersion: 'v2', originalSourceId: sourceId,
        classMaterialId: p.binding.kind === 'material' ? p.binding.materialId : null, canonicalKnowledgeItemId: null,
        sourceKey: sourceBindingKey(p.binding), title: p.title, documentVersion, checksum: p.originalHash,
        parserVersion: processingIdentity, v2Revision: revision, extractionStatus: revision.coverage.status === 'complete' ? 'ready' : 'needs_attention',
        structure: { schemaVersion: 'petros.v2.source-structure.v1' }, warnings: [] });
      await this.actor(tx, true);
      return revision;
    });
  }

  /** All payload pins are validated against the authorized immutable revision in one transaction. */
  async persist(input: unknown[]): Promise<ContentUnit[]> {
    if (!Array.isArray(input) || input.length < 1 || input.length > 100 || Buffer.byteLength(JSON.stringify(input)) > 512 * 1024)
      throw new Error('M1_BATCH_BUDGET_EXCEEDED');
    const units = input.map(parseBoundedContentUnit);
    if (new Set(units.map(u => u.sourceRevisionId)).size !== 1 || new Set(units.map(u => u.ordinal)).size !== units.length)
      throw new Error('M1_BATCH_SOURCE_OR_ORDINAL_MISMATCH');
    return this.db.transaction(async raw => {
      const tx = raw as unknown as Database, actor = await this.actor(tx, true), t = schema.petrosContentUnits;
      const r = await this.revision(tx, units[0]!.sourceRevisionId);
      if (!r || r.formatVersion !== 'v2' || !r.v2Revision) throw new NotFoundException('M1_SOURCE_UNAVAILABLE');
      const revision = sourceRevisionSchema.parse(r.v2Revision);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${revision.id},0))`);
      const referenceIds = [...new Set(units.flatMap(u => [u.id, ...(u.parentId ? [u.parentId] : []),
        ...(u.payload.kind === 'caption' ? [u.payload.describes] : []),
        ...u.relationships.flatMap(r => [r.fromUnitId, r.toUnitId, ...r.support.map(s => s.unitId)]), ...u.claims.flatMap(c => c.support.map(s => s.unitId))]))];
      if (referenceIds.length > 500) throw new Error('M1_REFERENCE_BUDGET_EXCEEDED');
      const existing = await tx.select({ manifest: t.manifest }).from(t).where(and(eq(t.sourceRevisionId, revision.id),
        or(inArray(t.id, referenceIds), inArray(t.ordinal, units.map(u => u.ordinal))))).limit(600);
      const available = new Map(existing.map(r => [r.manifest.id, parseBoundedContentUnit(r.manifest)]));
      const ordinals = new Map(existing.map(r => [r.manifest.ordinal, r.manifest]));
      const pins = [...new Map(units.flatMap(u => u.concepts).map(p => [`${p.id}:${p.version}`, p])).values()];
      if (pins.length > 24) throw new Error('M1_CONCEPT_BUDGET_EXCEEDED');
      if (pins.length) {
        const c = schema.petrosConceptVersions;
        const resolved = await tx.select({ id: c.conceptId, version: c.version }).from(c).where(and(eq(c.institutionId, actor.institutionId),
          or(...pins.map(p => and(eq(c.conceptId, p.id), eq(c.version, p.version)))))).limit(24);
        if (pins.some(p => !resolved.some(r => r.id === p.id && r.version === p.version))) throw new ConflictException('M1_UNKNOWN_CONCEPT_VERSION');
      }
      const result: ContentUnit[] = [];
      const inserts: typeof t.$inferInsert[] = [];
      for (const u of [...units].sort((a, b) => a.ordinal - b.ordinal)) {
        validateUnitProvenance(u, revision);
        if (u.institutionId !== actor.institutionId || digest(contentUnitHashInput(u)) !== u.contentHash) throw new ConflictException('M1_UNIT_HASH_OR_TENANT_MISMATCH');
        if (u.quality.state === 'reviewed' || u.claims.some(c => c.status !== 'proposed') || u.relationships.some(r => r.origin === 'reviewed') ||
          (u.payload.kind === 'equation' && u.payload.interpretation) || ['explain', 'compute', 'assess'].some(k => u.capabilities[k as 'explain'].status === 'supported'))
          throw new ConflictException('M1_REVIEW_RELEASE_NOT_ADMITTED');
        if (u.assets.some(a => a.objectId !== revision.source.binding.objectId || a.contentHash !== revision.source.originalHash))
          throw new NotFoundException('M1_ASSET_UNAVAILABLE');
        if (u.payload.kind === 'caption') {
          if (!available.has(u.payload.describes)) throw new ConflictException('M1_UNKNOWN_CAPTION_TARGET');
        }
        if (u.parentId && (!available.has(u.parentId) || available.get(u.parentId)!.ordinal >= u.ordinal)) throw new ConflictException('M1_INVALID_PARENT_UNIT');
        for (const ref of [...u.claims.flatMap(c => c.support), ...u.relationships.flatMap(r => r.support)]) {
          const support = available.get(ref.unitId);
          if (!support || (ref.semanticId && !unitSemanticIds(support).has(ref.semanticId)) || support.contentHash !== ref.unitHash || canonicalContent(referenceLocatorFor(support,ref.semanticId)) !== canonicalContent(ref.locator) ||
            ref.sourceId !== revision.source.id || ref.sourceHash !== revision.source.originalHash || ref.sourceRevisionId !== revision.id || ref.representationHash !== revision.representationHash)
            throw new ConflictException('M1_INVALID_SUPPORT_REFERENCE');
        }
        for (const rel of u.relationships) for (const id of [rel.fromUnitId, rel.toUnitId]) {
          if (id !== u.id && !available.has(id)) throw new ConflictException('M1_UNKNOWN_RELATIONSHIP_TARGET');
        }
        const prior = ordinals.get(u.ordinal);
        if (prior) {
          if (prior.id !== u.id || prior.contentHash !== u.contentHash) throw new ConflictException('M1_UNIT_RETRY_CONFLICT');
          result.push(parseBoundedContentUnit(prior)); continue;
        }
        inserts.push({ id: u.id, institutionId: actor.institutionId, sourceRevisionId: revision.id, parentId: u.parentId,
          ordinal: u.ordinal, kind: u.payload.kind, manifest: u, contentHash: u.contentHash, canonicalBody: contentUnitHashInput(u),
          searchableText: u.searchableText, createdBy: actor.userId! });
        result.push(u);
        available.set(u.id, u);
      }
      if (inserts.length) await tx.insert(t).values(inserts);
      await this.actor(tx, true);
      return result;
    });
  }

  private async revision(tx: Database, id: string) {
    const t = schema.petrosDocumentSourceRevisions;
    const [r] = await tx.select({ formatVersion: t.formatVersion, v2Revision: t.v2Revision }).from(t).where(eq(t.id, v2Uuid.parse(id))).limit(1);
    return r;
  }
  async lookup(sourceRevisionId: string, options: { unitId?: string; afterOrdinal?: number; limit?: number; query?: string; adjacentOrdinal?: number; contextOf?:string[]; visibleOnly?:boolean } = {}): Promise<UnitLookup> {
    const q = z.object({ unitId: v2Uuid.optional(), afterOrdinal: z.number().int().min(-1).max(9999).optional(),
      limit: z.number().int().min(1).max(50).optional(), query: z.string().min(1).max(200).optional(),
      adjacentOrdinal: z.number().int().min(0).max(9999).optional(),visibleOnly:z.boolean().optional(),contextOf:z.array(v2Uuid).min(1).max(4).optional() }).strict().parse(options);
    return this.db.transaction(async raw => {
      const tx = raw as unknown as Database;
      await this.actor(tx);
      const r = await this.revision(tx, sourceRevisionId);
      if (!r) return { status: 'unavailable', reason: 'unauthorized_or_revoked_source' };
      if (r.formatVersion !== 'v2' || !r.v2Revision) return { status: 'unsupported', reason: 'legacy_source_requires_v2_preparation' };
      const revision = sourceRevisionSchema.parse(r.v2Revision), t = schema.petrosContentUnits;
      const predicates = [eq(t.sourceRevisionId, sourceRevisionId), eq(t.institutionId, revision.source.institutionId), gte(t.ordinal, (q.afterOrdinal ?? -1) + 1)];
      if(q.visibleOnly && ['docx','txt','markdown'].includes(revision.source.kind))predicates.push(sql`coalesce(${t.manifest}->>'sourceChannel','visible')='visible'`);
      if (q.unitId) predicates.push(eq(t.id, q.unitId));
      if (q.query) predicates.push(sql`to_tsvector('simple',${t.searchableText}) @@ plainto_tsquery('simple',${q.query})`);
      const adjacent=q.adjacentOrdinal===undefined?undefined:and(gte(t.ordinal,Math.max(0,q.adjacentOrdinal-2)),lte(t.ordinal,q.adjacentOrdinal+2));
      if(q.contextOf)predicates.push(or(adjacent,inArray(t.parentId,q.contextOf),sql`${t.manifest}->'payload'->>'describes' IN (${sql.join(q.contextOf.map(id=>sql`${id}`),sql`,`)})`)!);
      else if(adjacent)predicates.push(adjacent);
      const order=q.query?[sql`ts_rank_cd(to_tsvector('simple',${t.searchableText}),plainto_tsquery('simple',${q.query})) DESC`,asc(t.ordinal)]:[asc(t.ordinal)];
      const rows = await tx.select({ manifest: t.manifest }).from(t).where(and(...predicates)).orderBy(...order).limit(q.limit ?? 20);
      const units: ContentUnit[] = []; let bytes = Buffer.byteLength(JSON.stringify(revision)) + 128, truncated = false;
      for (const row of rows) {
        const size = Buffer.byteLength(JSON.stringify(row.manifest));
        if (bytes + size > 512 * 1024) { truncated = true; break; }
        units.push(parseBoundedContentUnit(row.manifest)); bytes += size;
      }
      for (const u of units) { validateUnitProvenance(u, revision); if (digest(contentUnitHashInput(u)) !== u.contentHash) throw new Error('M1_PERSISTED_HASH_MISMATCH'); }
      // An entitlement may have changed between statements. Recheck before returning metadata.
      if (!await this.revision(tx, sourceRevisionId)) return { status: 'unavailable', reason: 'unauthorized_or_revoked_source' };
      return { status: 'available', revision, units, truncated, nextAfterOrdinal: (truncated || rows.length === (q.limit ?? 20)) && units.length ? units[units.length - 1]!.ordinal : null };
    });
  }

  async createConcept(courseId: string | null, input: unknown) {
    const payload = conceptVersionPayloadSchema.parse(input);
    return this.db.transaction(async raw => {
      const tx = raw as unknown as Database, actor = await this.actor(tx, true), id = randomUUID();
      await this.validateConceptPayload(tx, payload);
      await tx.insert(schema.petrosConcepts).values({ id, institutionId: actor.institutionId, courseId, createdBy: actor.userId! });
      await tx.insert(schema.petrosConceptVersions).values({ conceptId: id, institutionId: actor.institutionId, version: 1, payload,
        canonicalBody: canonicalContent(payload), contentHash: digest(canonicalContent(payload)), createdBy: actor.userId! });
      return { id, version: 1 };
    });
  }
  async appendConceptVersion(id: string, expectedVersion: number, input: unknown) {
    const payload = conceptVersionPayloadSchema.parse(input);
    return this.db.transaction(async raw => {
      const tx = raw as unknown as Database, actor = await this.actor(tx, true), t = schema.petrosConceptVersions;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${v2Uuid.parse(id)},0))`);
      const [prior] = await tx.select().from(t).where(eq(t.conceptId, id)).orderBy(sql`${t.version} DESC`).limit(1);
      if (!prior || prior.version !== expectedVersion) throw new ConflictException('M1_STALE_CONCEPT_VERSION');
      await this.validateConceptPayload(tx, payload);
      await tx.insert(t).values({ conceptId: id, institutionId: actor.institutionId, version: expectedVersion + 1,
        payload, canonicalBody: canonicalContent(payload), contentHash: digest(canonicalContent(payload)), createdBy: actor.userId! });
      return { id, version: expectedVersion + 1 };
    });
  }
  private async validateConceptPayload(tx: Database, p: z.infer<typeof conceptVersionPayloadSchema>) {
    if (p.mappings.length) throw new ConflictException('M1_REVIEWED_MAPPING_NOT_ADMITTED');
    for (const ref of p.provenance) {
      const [unit] = await tx.select({ manifest: schema.petrosContentUnits.manifest }).from(schema.petrosContentUnits)
        .where(and(eq(schema.petrosContentUnits.id, ref.unitId), eq(schema.petrosContentUnits.sourceRevisionId, ref.sourceRevisionId))).limit(1);
      if (!unit || unit.manifest.contentHash !== ref.unitHash || canonicalContent(unit.manifest.locator) !== canonicalContent(ref.locator) ||
        unit.manifest.sourceId !== ref.sourceId || unit.manifest.sourceHash !== ref.sourceHash || unit.manifest.representationHash !== ref.representationHash)
        throw new ConflictException('M1_CONCEPT_PROVENANCE_UNAVAILABLE');
    }
  }
}
