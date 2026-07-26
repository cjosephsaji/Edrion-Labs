import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { STUDENT_MODULE_CATALOG } from '@edrion/feature-flags';
import type { Database } from './client';
import { createDatabase, closeDatabase } from './client';
import * as s from './schema/index';

const INSTITUTION_MODULE_KEYS = [
  'timetable',
  'attendance',
  'grading',
  'registration',
  'fees',
  'transport',
  'hostel',
  'library',
  'health',
  'diary',
  'clubs',
  'events',
  'placements',
] as const;

const EXTRA_FEATURE_FLAGS: FeatureSeed[] = [
  {
    key: 'attendance.day_view',
    name: 'Attendance day view',
    description: 'Student attendance heatmap and day strip',
    module: 'student-portal',
    defaultValue: true,
    releaseStage: 'ga',
    owner: 'Product',
    availableScopes: ['global', 'plan', 'institution', 'campus', 'institution_user'],
  },
];

const EXTRA_STUDENT_SURFACE_FLAGS: Array<{
  key: string;
  name: string;
  defaultValue: boolean;
  availableScopes: string[];
}> = [
  {
    key: 'student.surface.today',
    name: 'Today surface',
    defaultValue: true,
    availableScopes: ['global', 'plan', 'institution', 'campus', 'institution_user', 'independent_user'],
  },
  {
    key: 'student.surface.requests',
    name: 'Requests surface',
    defaultValue: false,
    availableScopes: ['institution', 'campus', 'institution_user'],
  },
];

type FeatureSeed = {
  key: string;
  name: string;
  description: string;
  module: string;
  defaultValue: boolean;
  releaseStage: 'ga' | 'beta' | 'alpha';
  owner: string;
  availableScopes: string[];
};

function studentSurfaceRows(): FeatureSeed[] {
  const fromCatalog = STUDENT_MODULE_CATALOG.map((module) => ({
    key: `student.surface.${module.key}`,
    name: `${module.label} surface`,
    description: `Show ${module.label} to students`,
    module: 'student-portal',
    defaultValue: module.defaultVisible,
    releaseStage: 'ga' as const,
    owner: 'Product',
    availableScopes: module.individualCapable
      ? ['global', 'plan', 'institution', 'campus', 'institution_user', 'independent_user']
      : ['institution', 'campus', 'institution_user'],
  }));

  const extras = EXTRA_STUDENT_SURFACE_FLAGS.map((row) => ({
    key: row.key,
    name: row.name,
    description: row.name,
    module: 'student-portal',
    defaultValue: row.defaultValue,
    releaseStage: 'ga' as const,
    owner: 'Product',
    availableScopes: row.availableScopes,
  }));

  const institutionModules = INSTITUTION_MODULE_KEYS.map((key) => ({
    key: `institution.module.${key}`,
    name: `${key.replaceAll('_', ' ')} module`,
    description: 'Institution module activation switch',
    module: 'institution-modules',
    defaultValue: true,
    releaseStage: 'ga' as const,
    owner: 'Product',
    availableScopes: ['plan', 'institution', 'campus'],
  }));

  return [...fromCatalog, ...extras, ...institutionModules, ...EXTRA_FEATURE_FLAGS];
}

/** Idempotent upsert of student-portal feature definitions (safe after partial `db:seed`). */
export async function ensureStudentPortalFeatureDefinitions(db: Database) {
  const rows = studentSurfaceRows();
  for (const f of rows) {
    await db
      .insert(s.featureDefinitions)
      .values({
        key: f.key,
        name: f.name,
        description: f.description,
        module: f.module,
        defaultValue: f.defaultValue,
        releaseStage: f.releaseStage,
        owner: f.owner,
        availableScopes: f.availableScopes as never,
        status: 'active',
      })
      .onConflictDoNothing();
  }
}

async function main() {
  const db = createDatabase();
  // eslint-disable-next-line no-console
  console.log('→ Ensuring student portal feature definitions…');
  await ensureStudentPortalFeatureDefinitions(db);
  // eslint-disable-next-line no-console
  console.log(`✓ Upserted ${studentSurfaceRows().length} feature definition keys (conflicts skipped).`);
  await closeDatabase();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
