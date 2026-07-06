import { Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, DATABASE } from '../../../common/tokens';
import { PROMPT_VERSION } from './prompts/version';

export type AtomCacheScope = 'global' | 'institution';

@Injectable()
export class AtomCacheService {
  private readonly scope: AtomCacheScope;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.scope = (env as ApiEnv & { ATOM_CACHE_SCOPE?: AtomCacheScope }).ATOM_CACHE_SCOPE ?? 'global';
  }

  async get(
    topicId: string,
    atomKind: string,
    variantKey = 'default',
  ): Promise<Record<string, unknown> | null> {
    const row = await this.db
      .select({ content: schema.conceptAtoms.content })
      .from(schema.conceptAtoms)
      .where(
        and(
          eq(schema.conceptAtoms.topicId, topicId),
          eq(schema.conceptAtoms.atomKind, atomKind),
          eq(schema.conceptAtoms.variantKey, variantKey),
          eq(schema.conceptAtoms.promptVersion, PROMPT_VERSION),
        ),
      )
      .limit(1)
      .then((r) => r[0]);
    return row?.content ?? null;
  }

  async put(
    topicId: string,
    atomKind: string,
    content: Record<string, unknown>,
    model: string,
    variantKey = 'default',
  ): Promise<void> {
    await this.db
      .insert(schema.conceptAtoms)
      .values({
        topicId,
        atomKind,
        variantKey,
        content,
        model,
        promptVersion: PROMPT_VERSION,
      })
      .onConflictDoUpdate({
        target: [
          schema.conceptAtoms.topicId,
          schema.conceptAtoms.atomKind,
          schema.conceptAtoms.variantKey,
          schema.conceptAtoms.promptVersion,
        ],
        set: { content, model },
      });
  }

  get cacheScope(): AtomCacheScope {
    return this.scope;
  }
}
