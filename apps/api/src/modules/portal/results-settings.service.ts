import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, schema, type Database } from '@edrion/database';
import type { ResultsSettingsInput } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from './portal-action-context';

const KEYS = {
  showClassAverage: 'results.show_class_average',
  missingEntryPolicy: 'results.missing_entry_policy',
  hodReleaseGate: 'results.hod_release_gate',
  revaluationRefundOnReject: 'revaluation.refund_on_reject',
} as const;

@Injectable()
export class ResultsSettingsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(ctx: PortalActionContext) {
    const institutionId = ctx.principal.institutionId;
    const rows = await this.db
      .select()
      .from(schema.institutionSettings)
      .where(
        and(
          eq(schema.institutionSettings.institutionId, institutionId),
          isNull(schema.institutionSettings.campusId),
        ),
      );
    const map = new Map(rows.map((r) => [r.key, r]));
    return {
      showClassAverage: map.get(KEYS.showClassAverage)?.value !== 'false',
      missingEntryPolicy: (map.get(KEYS.missingEntryPolicy)?.value ?? 'block') as 'block' | 'confirm',
      hodReleaseGate: map.get(KEYS.hodReleaseGate)?.value === 'true',
      revaluationRefundOnReject: map.get(KEYS.revaluationRefundOnReject)?.value === 'true',
      version: Number(map.get(KEYS.showClassAverage)?.version ?? 0),
    };
  }

  async put(ctx: PortalActionContext, input: ResultsSettingsInput) {
    const institutionId = ctx.principal.institutionId;
    const entries: Array<{ key: string; label: string; value: string }> = [
      { key: KEYS.showClassAverage, label: 'Show class average', value: String(input.showClassAverage) },
      { key: KEYS.missingEntryPolicy, label: 'Missing entry policy', value: input.missingEntryPolicy },
      { key: KEYS.hodReleaseGate, label: 'HOD release gate', value: String(input.hodReleaseGate) },
      {
        key: KEYS.revaluationRefundOnReject,
        label: 'Refund revaluation fee on reject',
        value: String(input.revaluationRefundOnReject),
      },
    ];
    for (const entry of entries) {
      const [existing] = await this.db
        .select()
        .from(schema.institutionSettings)
        .where(
          and(
            eq(schema.institutionSettings.institutionId, institutionId),
            eq(schema.institutionSettings.key, entry.key),
            isNull(schema.institutionSettings.campusId),
          ),
        )
        .limit(1);
      if (existing) {
        await this.db
          .update(schema.institutionSettings)
          .set({ value: entry.value, version: existing.version + 1, updatedAt: new Date() })
          .where(eq(schema.institutionSettings.id, existing.id));
      } else {
        await this.db.insert(schema.institutionSettings).values({
          institutionId,
          campusId: null,
          category: 'student_portal',
          key: entry.key,
          label: entry.label,
          valueType: 'string',
          value: entry.value,
        });
      }
    }
    return this.get(ctx);
  }

  async boolSetting(institutionId: string, key: string, fallback = false) {
    const [row] = await this.db
      .select()
      .from(schema.institutionSettings)
      .where(and(eq(schema.institutionSettings.institutionId, institutionId), eq(schema.institutionSettings.key, key)))
      .limit(1);
    if (!row) return fallback;
    return row.value === 'true';
  }

  async stringSetting(institutionId: string, key: string, fallback: string) {
    const [row] = await this.db
      .select()
      .from(schema.institutionSettings)
      .where(and(eq(schema.institutionSettings.institutionId, institutionId), eq(schema.institutionSettings.key, key)))
      .limit(1);
    return row?.value ?? fallback;
  }
}
