/**
 * Geo backfill — populates the standardized companion columns added in migration 0025
 * from existing legacy values, using the centralized, reliable normalizers in
 * @edrion/schemas. Idempotent (only fills NULL companions) and non-destructive (legacy
 * columns are preserved). Prints a migration report of values that could not be mapped.
 *
 *   pnpm --filter @edrion/database backfill:geo          # apply
 *   pnpm --filter @edrion/database backfill:geo -- --dry # report only, no writes
 */
import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { sql } from 'drizzle-orm';
import {
  normalizePhone,
  normalizeCountryCode,
  normalizeAdministrativeDivisionCode,
} from '@edrion/schemas';
import { createDatabase, closeDatabase } from './client';

const DRY = process.argv.includes('--dry');

interface Report {
  table: string;
  scanned: number;
  mapped: number;
  unmapped: { id: string; field: string; value: string }[];
}

async function backfill() {
  const db = createDatabase();
  const reports: Report[] = [];

  // ── institution_users.phone → phone_e164 / phone_country_code ────────────────
  {
    const rows = await db.execute<{ id: string; phone: string | null }>(sql`
      SELECT id, phone FROM institution_users
      WHERE phone IS NOT NULL AND phone <> '' AND phone_e164 IS NULL
    `);
    const r: Report = { table: 'institution_users', scanned: rows.length, mapped: 0, unmapped: [] };
    for (const row of rows) {
      const res = normalizePhone(row.phone);
      if (res.ok && res.e164) {
        r.mapped++;
        if (!DRY) {
          await db.execute(sql`
            UPDATE institution_users
            SET phone_e164 = ${res.e164}, phone_country_code = ${res.country ?? null}
            WHERE id = ${row.id}
          `);
        }
      } else {
        r.unmapped.push({ id: row.id, field: 'phone', value: row.phone! });
      }
    }
    reports.push(r);
  }

  // ── institution_registration_requests.contact_phone / region / country ───────
  {
    const rows = await db.execute<{
      id: string;
      contact_phone: string | null;
      region: string | null;
      country: string | null;
      administrative_division_code: string | null;
      contact_phone_e164: string | null;
    }>(sql`
      SELECT id, contact_phone, region, country, administrative_division_code, contact_phone_e164
      FROM institution_registration_requests
    `);
    const r: Report = {
      table: 'institution_registration_requests',
      scanned: rows.length,
      mapped: 0,
      unmapped: [],
    };
    for (const row of rows) {
      const updates: string[] = [];
      let e164: string | null = null;
      let divCode: string | null = null;

      if (row.contact_phone && !row.contact_phone_e164) {
        const res = normalizePhone(row.contact_phone);
        if (res.ok && res.e164) {
          e164 = res.e164;
          updates.push('contact_phone_e164');
        } else {
          r.unmapped.push({ id: row.id, field: 'contact_phone', value: row.contact_phone });
        }
      }

      const iso2 = normalizeCountryCode(row.country);
      if (row.region && !row.administrative_division_code && iso2) {
        const code = normalizeAdministrativeDivisionCode(iso2, row.region);
        if (code) {
          divCode = code;
          updates.push('administrative_division_code');
        } else {
          r.unmapped.push({ id: row.id, field: 'region', value: row.region });
        }
      }

      if (updates.length) {
        r.mapped++;
        if (!DRY) {
          await db.execute(sql`
            UPDATE institution_registration_requests
            SET contact_phone_e164 = COALESCE(${e164}, contact_phone_e164),
                administrative_division_code = COALESCE(${divCode}, administrative_division_code)
            WHERE id = ${row.id}
          `);
        }
      }
    }
    reports.push(r);
  }

  // ── Report ───────────────────────────────────────────────────────────────────
  console.log(`\nGeo backfill ${DRY ? '(DRY RUN — no writes)' : ''}\n${'─'.repeat(48)}`);
  for (const r of reports) {
    console.log(`\n${r.table}: scanned ${r.scanned}, mapped ${r.mapped}, unmapped ${r.unmapped.length}`);
    for (const u of r.unmapped.slice(0, 20)) {
      console.log(`  ⚠ ${u.id}  ${u.field}="${u.value}"  → left for manual review`);
    }
    if (r.unmapped.length > 20) console.log(`  … and ${r.unmapped.length - 20} more`);
  }
  console.log('');

  await closeDatabase();
}

backfill().catch((e) => {
  console.error(e);
  process.exit(1);
});
