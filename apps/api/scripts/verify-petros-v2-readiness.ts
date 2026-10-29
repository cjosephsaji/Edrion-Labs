/**
 * M0 only. Run from any cwd:
 * pnpm --filter @edrion/database exec tsx --tsconfig ../../apps/api/tsconfig.json ../../apps/api/scripts/verify-petros-v2-readiness.ts
 *
 * stdout is a redacted JSON inventory. --offline skips PostgreSQL/Redis; --strict
 * exits 1 on BLOCKED; --compact omits verbose catalog evidence. No app bootstrap,
 * migrate.ts, registry sync, queue creation, scanner upload or provider execution.
 * Every database probe uses a READ ONLY transaction on DATABASE_URL, never the
 * migration credential. Parser fixtures contain synthetic public text only.
 */
import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import postgres from 'postgres';
import Redis from 'ioredis';
import JSZip from 'jszip';
import { apiEnvSchema } from '@edrion/config';
import { PETROS_FUNCTION_CATALOG } from '@edrion/schemas';
import {
  planPetrosRoute,
  type RoutingCandidate,
  type RoutingRule,
  type BudgetState,
} from '../src/modules/petros-ai-routing/petros-routing-engine';
import { KnowledgePdfProcess } from '../src/modules/student/knowledge/knowledge-pdf-process';
import { MaterialDocumentPreviewService } from '../src/modules/student/materials/material-document-preview.service';

type Status = 'PASS' | 'WARNING' | 'BLOCKED' | 'UNVERIFIED';
type Finding = {
  id: string;
  status: Status;
  summary: string;
  evidence?: unknown;
};
const run = promisify(execFile);
const findings: Finding[] = [];
const args = new Set(process.argv.slice(2));
const offline = args.has('--offline');
const compact = args.has('--compact');
const root = resolve(__dirname, '../../..');
const apiRoot = join(root, 'apps/api');
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
// Never print raw errors (URLs/passwords/provider messages can appear in them).
const label = (v: unknown) =>
  typeof v === 'string' && /^[a-zA-Z0-9_.:/-]{1,150}$/.test(v) ? v : '[redacted]';
const errorCode = (v: unknown) => label((v as { code?: unknown })?.code ?? 'PROBE_FAILED');
const add = (id: string, status: Status, summary: string, evidence?: unknown) =>
  findings.push({
    id,
    status,
    summary,
    ...(evidence === undefined ? {} : { evidence }),
  });
const read = (path: string) => readFile(join(root, path), 'utf8');
const numericSettings = (raw: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(raw).filter(
      ([key, value]) =>
        [
          'maxInputTokens',
          'maxOutputTokens',
          'temperature',
          'timeoutMs',
          'maxRetries',
          'streaming',
          'caching',
          'dailyRequestLimit',
          'monthlyRequestLimit',
          'maxCostPerRequestMicros',
          'maxCostPerStudentMicros',
          'maxInstitutionUsage',
          'inputPerMillionMicros',
          'outputPerMillionMicros',
          'cachedInputPerMillionMicros',
          'audioPerMinuteMicros',
          'ttsPerMillionCharactersMicros',
        ].includes(key) &&
        (typeof value === 'number' || typeof value === 'boolean'),
    ),
  );

async function filesUnder(path: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(join(root, path), {
    withFileTypes: true,
  })) {
    if (entry.name.startsWith('._') || entry.name === 'node_modules') continue;
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await filesUnder(child)));
    else if (entry.isFile()) result.push(child);
  }
  return result.sort();
}

async function localInventory() {
  const { stdout: status } = await run('git', ['status', '--porcelain=v1', '-z'], { cwd: root });
  const { stdout: head } = await run('git', ['rev-parse', 'HEAD'], {
    cwd: root,
  });
  const { stdout: branch } = await run('git', ['branch', '--show-current'], {
    cwd: root,
  });
  const changes = status.split('\0').filter(Boolean);
  add('git', 'PASS', 'Existing changes inventoried; no Git mutation performed.', {
    head: head.trim(),
    branch: branch.trim(),
    changedEntries: changes.length,
    ...(compact ? {} : { changes }),
  });
  const schemaFiles = (await filesUnder('packages/database/src/schema')).filter((p) =>
    p.endsWith('.ts'),
  );
  const declarations: string[] = [];
  for (const file of schemaFiles)
    for (const match of (await read(file)).matchAll(/pgTable\(\s*['"]([^'"]+)['"]/g))
      declarations.push(match[1]!);
  const journal = JSON.parse(await read('packages/database/migrations/meta/_journal.json')) as {
    entries: { idx: number; tag: string; when: number }[];
  };
  const migrations = new Map<string, { tag: string; when: number }>();
  const missingFiles: string[] = [];
  for (const entry of journal.entries) {
    try {
      migrations.set(hash(await read(`packages/database/migrations/${entry.tag}.sql`)), entry);
    } catch {
      missingFiles.push(entry.tag);
    }
  }
  const journalTags = new Set(journal.entries.map((e) => `${e.tag}.sql`));
  const unjournaled = (await readdir(join(root, 'packages/database/migrations')))
    .filter((p) => p.endsWith('.sql') && !p.startsWith('._') && !journalTags.has(p))
    .sort();
  const nonMonotonic = journal.entries
    .filter(
      (e, i) =>
        i > 0 && (e.idx <= journal.entries[i - 1]!.idx || e.when <= journal.entries[i - 1]!.when),
    )
    .map((e) => e.tag);
  add(
    'migration.local',
    missingFiles.length || nonMonotonic.length
      ? 'BLOCKED'
      : unjournaled.length
        ? 'WARNING'
        : 'PASS',
    'Journal/file consistency; standalone SQL is reapplied by migrate.ts, followed by a data backfill.',
    {
      entries: journal.entries.length,
      latest: journal.entries.at(-1)?.tag,
      missingFiles,
      nonMonotonic,
      unjournaled,
      postMigrationSql: (await readdir(join(root, 'packages/database/migrations/sql')))
        .filter((p) => p.endsWith('.sql') && !p.startsWith('._'))
        .sort(),
    },
  );
  add(
    'schema.declarations',
    'PASS',
    'Source declarations counted; declaration presence does not prove installation.',
    { tables: new Set(declarations).size, files: schemaFiles.length },
  );
  return { declarations: [...new Set(declarations)].sort(), migrations };
}

async function databaseInventory(local: Awaited<ReturnType<typeof localInventory>>) {
  if (offline || !process.env.DATABASE_URL) {
    add(
      'database',
      'UNVERIFIED',
      offline
        ? 'Database probes skipped by --offline.'
        : 'DATABASE_URL unavailable; applied schema, RLS, bindings and routes are unverified.',
    );
    return;
  }
  const db = postgres(process.env.DATABASE_URL, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 5,
    onnotice: () => {},
    connection: {
      default_transaction_read_only: true,
      statement_timeout: 10000,
      lock_timeout: 2000,
      application_name: 'petros-v2-m0-readiness',
    },
  });
  // Individual read-only transactions allow a denied/missing table to be reported
  // without aborting the rest of the inventory. No SET ROLE or security-definer call.
  const probe = async (id: string, fn: (tx: postgres.TransactionSql) => Promise<void>) => {
    try {
      await db.begin('isolation level repeatable read read only', fn);
    } catch (error) {
      add(id, 'UNVERIFIED', 'Read-only probe unavailable; no raw database error displayed.', {
        code: errorCode(error),
      });
    }
  };
  try {
    let installed = new Set<string>();
    await probe('database.catalog', async (tx) => {
      const [role] = await tx`select r.rolsuper, r.rolbypassrls, r.rolname,
        current_setting('transaction_read_only') as read_only from pg_roles r where r.rolname = current_user`;
      add(
        'database.role',
        role?.rolsuper || role?.rolbypassrls ? 'BLOCKED' : 'PASS',
        'Configured application connection role and read-only transaction verified.',
        role,
      );
      const tables =
        await tx`select c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
        pg_has_role(current_user,c.relowner,'USAGE') as owner_member,
        (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies,
        exists(select 1 from pg_attribute a where a.attrelid=c.oid and not a.attisdropped and a.attname in ('institution_id','student_id','independent_user_id')) as owner_scoped
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p') order by c.relname`;
      installed = new Set(tables.map((t) => String(t.name)));
      const missing = local.declarations.filter((t) => !installed.has(t));
      const documentTables = [
        'petros_document_source_revisions',
        'petros_document_preparations',
        'petros_document_lesson_artifacts',
        'petros_document_learner_paths',
      ];
      add(
        'database.schema',
        missing.length ? 'BLOCKED' : 'PASS',
        'Actual catalog compared with every pgTable declaration.',
        { installedTables: installed.size, missing },
      );
      add(
        'database.document-learning',
        documentTables.every((t) => installed.has(t)) ? 'PASS' : 'BLOCKED',
        'Four existing document-learning tables checked in actual catalog.',
        Object.fromEntries(documentTables.map((t) => [t, installed.has(t)])),
      );
      add(
        'database.v2-tables',
        'WARNING',
        'Planned V2 tables inventoried only; creation belongs to later milestones.',
        Object.fromEntries(
          [
            'petros_concepts',
            'petros_concept_versions',
            'petros_content_units',
            'petros_task_exposures',
            'petros_concept_beliefs',
          ].map((t) => [t, installed.has(t)]),
        ),
      );
      const relevant = tables.filter((t) =>
        /^(petros_|knowledge_|course_curriculum_|storage_objects$|student_auth_sessions$|assignments$|assignment_assignees$)/.test(
          String(t.name),
        ),
      );
      const noRls = relevant
        .filter(
          (t) => (t.owner_scoped || t.name === 'knowledge_item_pages') && (!t.rls || !t.policies),
        )
        .map((t) => t.name);
      const bypass = relevant
        .filter((t) => t.rls && t.owner_member && !t.force_rls)
        .map((t) => t.name);
      add(
        'database.rls',
        noRls.length || bypass.length ? 'BLOCKED' : 'PASS',
        'Owner-scoped RLS flags, policy count and role ownership inspected; global control-plane tables are not assumed student-private.',
        {
          noRls,
          ownerBypass: bypass,
          ...(compact ? {} : { tables: relevant }),
        },
      );
      if (!compact) {
        const policies =
          await tx`select tablename, policyname, permissive, roles, cmd, qual, with_check from pg_policies
          where schemaname='public' and (tablename like 'petros_%' or tablename like 'knowledge_%' or tablename in ('storage_objects','assignments','student_auth_sessions')) order by tablename,policyname`;
        add(
          'database.policy-definitions',
          'PASS',
          'Catalog policy expressions inspected; no learner rows selected.',
          policies,
        );
      }
      const privileges = await tx`select c.relname as table_name,
        has_table_privilege(current_user,c.oid,'SELECT') as current_select,
        has_table_privilege(current_user,c.oid,'UPDATE') as current_update,
        has_table_privilege(current_user,c.oid,'DELETE') as current_delete,
        case when to_regrole('edrion_app') is not null then has_table_privilege('edrion_app',c.oid,'SELECT') end as app_select,
        case when to_regrole('edrion_app') is not null then has_table_privilege('edrion_app',c.oid,'UPDATE') end as app_update,
        case when to_regrole('edrion_app') is not null then has_table_privilege('edrion_app',c.oid,'DELETE') end as app_delete,
        (select count(*)::int from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers
        from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
        and c.relname in ('petros_teaching_pack_candidates','petros_teaching_pack_reviews','petros_reviewer_qualifications','petros_objective_evidence_events','petros_learning_responses','learner_model_events','audit_events') order by c.relname`;
      const appendOnly = new Set([
        'petros_teaching_pack_candidates',
        'petros_teaching_pack_reviews',
        'petros_reviewer_qualifications',
        'petros_objective_evidence_events',
        'learner_model_events',
        'audit_events',
      ]);
      add(
        'database.grants',
        privileges.some(
          (t) =>
            appendOnly.has(String(t.table_name)) && (t.app_update || t.app_delete || !t.app_select),
        )
          ? 'BLOCKED'
          : 'PASS',
        'Effective app-role grants and trigger counts inspected; mutation rejection exercised separately in disposable tests.',
        privileges,
      );
    });
    if (!installed.size) return;
    await probe('database.columns-constraints', async (tx) => {
      const columns = await tx`select table_name,column_name,data_type,is_nullable,column_default
        from information_schema.columns where table_schema='public' and table_name in
        ('assignments','storage_objects','petros_learning_sessions','knowledge_preparations','petros_teaching_pack_candidates','petros_teaching_pack_reviews') order by table_name,ordinal_position`;
      const has = (table: string, column: string) =>
        columns.some((c) => c.table_name === table && c.column_name === column);
      const required = {
        guidanceColumn: has('assignments', 'petros_guidance'),
        staffStorageOwner: has('storage_objects', 'owner_staff_user_id'),
        v1SessionVersion: has('petros_learning_sessions', 'version'),
        v2EnginePin: has('petros_learning_sessions', 'engine_version'),
        v2TurnEpoch: has('petros_learning_sessions', 'turn_epoch'),
      };
      const constraints =
        await tx`select c.relname as table_name,k.conname as name,k.contype as type,pg_get_constraintdef(k.oid) as definition from pg_constraint k
        join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname in ('petros_learning_sessions','petros_observations','petros_answer_evaluations','petros_session_commands','knowledge_item_versions','knowledge_preparations','petros_teaching_pack_candidates','petros_teaching_pack_reviews','petros_objective_evidence_events') order by c.relname,k.conname`;
      add(
        'database.columns-constraints',
        required.guidanceColumn && required.staffStorageOwner ? 'PASS' : 'BLOCKED',
        'Existing column prerequisites and actual PK/FK/CHECK definitions inspected. V2 engine/epoch absence is expected before later additive milestones.',
        { required, ...(compact ? {} : { columns, constraints }) },
      );
    });
    await probe('database.feature-flags', async (tx) => {
      const definitions =
        await tx`select key,status,default_value,dependencies from feature_definitions where key like '%petros%' or key='student.portal' or key like 'student.surface.%' order by key`;
      const assignments =
        await tx`select d.key,a.scope,a.value,count(*)::int as count from feature_assignments a join feature_definitions d on d.id=a.feature_id
        where a.enabled and (a.activates_at is null or a.activates_at<=now()) and (a.expires_at is null or a.expires_at>now()) and
        (d.key like '%petros%' or d.key='student.portal' or d.key like 'student.surface.%') group by d.key,a.scope,a.value order by d.key,a.scope`;
      const rollouts =
        await tx`select d.key,r.type,r.enabled,r.percentage,jsonb_array_length(r.allow_list) as allow_count,jsonb_array_length(r.block_list) as block_count from feature_rollouts r join feature_definitions d on d.id=r.feature_id
        where d.key like '%petros%' or d.key='student.portal' or d.key like 'student.surface.%' order by d.key,r.type`;
      add(
        'database.feature-flags',
        'PASS',
        'Database feature definitions, active assignment aggregates and rollout metadata inspected without owner IDs. Per-student effective resolution is unverified.',
        { definitions, assignments, rollouts },
      );
    });
    await probe('database.applied-migrations', async (tx) => {
      const rows =
        await tx`select hash, created_at from drizzle.__drizzle_migrations order by created_at,id`;
      const applied = new Set(rows.map((r) => String(r.hash)));
      const pending = [...local.migrations].filter(([h]) => !applied.has(h)).map(([, e]) => e.tag);
      const unknown = rows.filter((r) => !local.migrations.has(String(r.hash))).length;
      const timeMismatch = rows
        .filter(
          (r) =>
            local.migrations.has(String(r.hash)) &&
            Number(r.created_at) !== local.migrations.get(String(r.hash))!.when,
        )
        .map((r) => ({
          tag: local.migrations.get(String(r.hash))!.tag,
          journalWhen: local.migrations.get(String(r.hash))!.when,
          appliedWhen: Number(r.created_at),
        }));
      add(
        'database.applied-migrations',
        pending.length || unknown || timeMismatch.length ? 'BLOCKED' : 'PASS',
        'Applied migration SHA-256 hashes and timestamps compared with journal; unmatched hashes may reflect edited applied files, not necessarily unapplied DDL.',
        {
          applied: rows.length,
          pendingOrChanged: pending,
          unknownHashes: unknown,
          timestampMismatches: timeMismatch,
          latestMatched: local.migrations.get(String(rows.at(-1)?.hash))?.tag,
        },
      );
    });
    await probe('database.baseline', async (tx) => {
      // Only aggregate counts, never IDs, names, answers, prompts or transcript text.
      const summaries: Record<string, unknown> = {};
      for (const [table, column] of [
        ['petros_learning_sessions', 'status'],
        ['petros_conversations', 'status'],
        ['knowledge_items', 'status'],
        ['storage_objects', 'processing_status'],
      ] as const) {
        if (installed.has(table))
          summaries[table] =
            await tx`select ${tx(column)} as state,count(*)::int as count from ${tx(table)} group by ${tx(column)} order by ${tx(column)}`;
      }
      if (installed.has('assignments'))
        summaries.teacherGoals =
          await tx`select status,count(*)::int as count from assignments where petros_guidance is not null group by status order by status`;
      if (installed.has('storage_objects'))
        summaries.teacherFiles = await tx`select mime_type,count(*)::int as count,
        count(*) filter(where nullif(derived->'guidanceText'->>'text','') is not null)::int as readable,
        count(*) filter(where derived->'guidanceText'->>'truncated'='true')::int as truncated
        from storage_objects where kind='petros_guidance_attachment' group by mime_type order by mime_type`;
      add(
        'database.baseline',
        'PASS',
        'Aggregate V1 state/data availability observed; counts do not prove successful journeys.',
        summaries,
      );
    });
    await probe('database.course-reviewer-bindings', async (tx) => {
      const [counts] = await tx`select count(*)::int as active_courses,
        count(*) filter(where subject_id is not null)::int as subject_mapped_courses from courses where status='active'`;
      const qualifications =
        await tx`with latest as (select distinct on (qualification_id) * from petros_reviewer_qualifications order by qualification_id,qualification_version desc)
        select count(*)::int as latest_qualifications,count(*) filter(where status='active' and valid_from<=now() and valid_until>now())::int as currently_dated from latest`;
      // Temporal/identity screening only. Never label this a valid review binding:
      // current scoped permissions, canonical pilot selection and curriculum need
      // the authoritative service and exact approved subject, not title matching.
      const identity =
        await tx`with latest as (select distinct on (qualification_id) * from petros_reviewer_qualifications order by qualification_id,qualification_version desc)
        select count(*)::int as active_identity_qualifications from latest q
        join institution_users u on u.id=q.reviewer_user_id and u.institution_id=q.institution_id
        join staff s on s.id=q.reviewer_staff_id and s.institution_id=q.institution_id and s.institution_user_id=u.id
        where q.status='active' and q.valid_from<=now() and q.valid_until>now() and u.status='active' and s.status='active'`;
      add(
        'database.course-reviewer-bindings',
        !counts?.subject_mapped_courses || !Number(identity[0]?.active_identity_qualifications)
          ? 'BLOCKED'
          : 'UNVERIFIED',
        'Course mapping and qualification aggregates screened. Exact cloud/English pilot bindings and current approval permissions still require authoritative selection.',
        { courses: counts, qualifications, identity },
      );
    });
    await probe('ai.configuration', async (tx) => {
      const providers =
        await tx`select id,key,adapter_type,enabled,paused,priority,health_status,latency_ms,last_health_check_at,daily_budget_micros,monthly_budget_micros,capabilities,
        (credential_envelope is not null and credential_envelope<>'') as credential_configured, (base_url is not null) as custom_endpoint from petros_ai_providers order by key`;
      const models = await tx`select id,provider_id,model_key,enabled,capabilities,pricing,
        provider_options->>'pricingUnit' as modality_unit,provider_options->>'priceMicrosPerHour' as micros_per_hour,
        provider_options->>'priceMicrosPerMillionCharacters' as micros_per_million_characters from petros_ai_models order by model_key`;
      const functions =
        await tx`select id,key,enabled,allowed_input_types,required_capabilities,settings,active_prompt_version,active_schema_version from petros_ai_functions order by key`;
      const routes =
        await tx`select id,function_id,provider_id,model_id,tier,traffic_percent,enabled,overrides from petros_ai_function_routes order by tier,id`;
      const rules =
        await tx`select id,priority,enabled,function_id,conditions,action from petros_ai_routing_rules order by priority,id`;
      const versions =
        await tx`select function_id,prompt_version,schema_version,status,count(*)::int as count from petros_ai_function_versions group by function_id,prompt_version,schema_version,status`;
      const policies =
        await tx`select scope,enabled,monthly_budget_micros,daily_budget_micros,thresholds,preserve_essential_functions from petros_ai_budget_policies where scope='global'`;
      const spend = await tx`select provider_id,
        coalesce(sum(coalesce(actual_cost_micros,estimated_cost_micros)) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),0)::bigint as daily,
        coalesce(sum(coalesce(actual_cost_micros,estimated_cost_micros)) filter(where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC'),0)::bigint as monthly,
        coalesce(sum(coalesce(actual_cost_micros,estimated_cost_micros)) filter(where created_at>=now()-interval '30 days' and created_at<=now()),0)::bigint as rolling_30
        from petros_ai_usage_events group by provider_id`;
      const quota =
        await tx`select function_id,count(distinct request_id) filter(where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')::int as daily_requests,
        count(distinct request_id) filter(where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')::int as monthly_requests from petros_ai_usage_events group by function_id`;
      const policy = policies[0];
      const percentUsed =
        policy?.enabled && Number(policy.monthly_budget_micros)
          ? (spend.reduce((a, r) => a + Number(r.rolling_30), 0) /
              Number(policy.monthly_budget_micros)) *
            100
          : 0;
      const thresholds = Array.isArray(policy?.thresholds) ? policy.thresholds : [];
      const action =
        [...thresholds]
          .sort((a, b) => a.percent - b.percent)
          .filter((t) => percentUsed >= t.percent)
          .at(-1)?.action ?? 'none';
      const budget: BudgetState = { percentUsed, action };
      const safeProvider = (p: (typeof providers)[number]) => ({
        key: label(p.key),
        adapter: label(p.adapter_type),
        enabled: p.enabled,
        paused: p.paused,
        credentialConfigured: p.credential_configured,
        customEndpoint: p.custom_endpoint,
        health: label(p.health_status),
        lastHealthCheck: p.last_health_check_at,
        dailyBudgetMicros: p.daily_budget_micros,
        monthlyBudgetMicros: p.monthly_budget_micros,
        declaredCapabilities: p.capabilities.map(label),
      });
      add(
        'ai.providers',
        'PASS',
        'Stored provider state observed; credential decryptability, endpoint support and current health are unverified.',
        providers.map(safeProvider),
      );
      add(
        'ai.models',
        'PASS',
        'Enabled and disabled models inventoried; declared capabilities are not adapter/runtime proof.',
        models.map((m) => ({
          provider: label(providers.find((p) => p.id === m.provider_id)?.key),
          model: label(m.model_key),
          enabled: m.enabled,
          capabilities: m.capabilities.map(label),
          pricing: numericSettings(m.pricing),
          modalityPricing: {
            unit: m.modality_unit ? label(m.modality_unit) : null,
            microsPerHour:
              m.micros_per_hour && Number.isFinite(Number(m.micros_per_hour))
                ? Number(m.micros_per_hour)
                : null,
            microsPerMillionCharacters:
              m.micros_per_million_characters &&
              Number.isFinite(Number(m.micros_per_million_characters))
                ? Number(m.micros_per_million_characters)
                : null,
          },
        })),
      );
      add(
        'ai.budgets',
        policy ? 'PASS' : 'BLOCKED',
        'Stored global policy, UTC spend and rolling-30-day preview budget observed; no budget reserved.',
        {
          policies: policies.map((p) => ({
            enabled: p.enabled,
            monthlyBudgetMicros: p.monthly_budget_micros,
            dailyBudgetMicros: p.daily_budget_micros,
            thresholds: p.thresholds.map((t: { percent: number; action: string }) => ({
              percent: t.percent,
              action: label(t.action),
            })),
            preserveEssentialFunctions: p.preserve_essential_functions,
          })),
          percentUsed,
          action: label(action),
          providerSpend: spend.map((s) => ({
            provider: label(providers.find((p) => p.id === s.provider_id)?.key),
            dailyMicros: s.daily,
            monthlyMicros: s.monthly,
            rolling30Micros: s.rolling_30,
          })),
          enabledRules: rules
            .filter((r) => r.enabled)
            .map((r) => ({
              priority: r.priority,
              action: label(r.action.kind),
              conditionCount: (r.conditions.all?.length ?? 0) + (r.conditions.any?.length ?? 0),
            })),
        },
      );
      const plans = functions.map((fn) => {
        const candidates: RoutingCandidate[] = routes
          .filter((r) => r.function_id === fn.id)
          .flatMap((r) => {
            const p = providers.find((p) => p.id === r.provider_id),
              m = models.find((m) => m.id === r.model_id),
              s = spend.find((s) => s.provider_id === r.provider_id);
            if (!p || !m) return [];
            return [
              {
                routeId: r.id,
                providerId: p.id,
                providerKey: p.key,
                providerName: p.key,
                providerEnabled: p.enabled,
                providerPaused: p.paused,
                providerHealth: p.health_status,
                providerLatencyMs: p.latency_ms,
                providerDailyBudgetMicros:
                  p.daily_budget_micros == null ? null : Number(p.daily_budget_micros),
                providerMonthlyBudgetMicros:
                  p.monthly_budget_micros == null ? null : Number(p.monthly_budget_micros),
                providerDailySpendMicros: Number(s?.daily ?? 0),
                providerMonthlySpendMicros: Number(s?.monthly ?? 0),
                modelId: m.id,
                modelKey: m.model_key,
                modelName: m.model_key,
                modelEnabled: m.enabled,
                capabilities: m.capabilities,
                inputCostPerMillionMicros: Number(m.pricing.inputPerMillionMicros ?? 0),
                outputCostPerMillionMicros: Number(m.pricing.outputPerMillionMicros ?? 0),
                tier: r.tier,
                trafficPercent: r.traffic_percent,
                routeEnabled: r.enabled,
              },
            ];
          });
        const active = versions.filter((v) => v.function_id === fn.id && v.status === 'active');
        const q = quota.find((q) => q.function_id === fn.id);
        const routeSummary = (c: RoutingCandidate) => {
          const p = providers.find((p) => p.id === c.providerId)!;
          const speechAdapter = !['anthropic', 'gemini'].includes(p.adapter_type);
          return {
            provider: label(c.providerKey),
            model: label(c.modelKey),
            tier: c.tier,
            credentialConfigured: p.credential_configured,
            ...(fn.key.startsWith('speech.') || fn.key === 'interaction.spoken'
              ? {
                  adapterSpeechImplemented: speechAdapter,
                  ...(fn.key === 'speech.synthesise'
                    ? {
                        requestedVoice: 'cedar (mentor default); marin optional',
                        effectiveVoice: speechAdapter
                          ? /gpt-4o.*tts/i.test(c.modelKey)
                            ? 'cedar/marin'
                            : 'onyx'
                          : null,
                        silentSubstitution: speechAdapter && !/gpt-4o.*tts/i.test(c.modelKey),
                      }
                    : {}),
                  ...(fn.key === 'interaction.spoken'
                    ? {
                        effectiveVoice: speechAdapter ? 'alloy' : null,
                        transport: 'HTTP chat/completions; complete MP3; not duplex',
                      }
                    : {}),
                }
              : {}),
          };
        };
        let ordered: ReturnType<typeof routeSummary>[] = [];
        let routingError: string | undefined;
        const inputModality = (
          fn.key === 'speech.transcribe'
            ? 'audio'
            : fn.allowed_input_types.includes('text')
              ? 'text'
              : fn.allowed_input_types[0]
        ) as 'text' | 'audio' | 'image' | 'document';
        try {
          const plan = planPetrosRoute({
            context: {
              functionKey: fn.key,
              inputModality,
              estimatedTokens: 250,
              currentCostMicros: 0,
              previousFailures: 0,
              language: 'en',
              requestId: '00000000-0000-4000-8000-000000000001',
            },
            fn: {
              id: fn.id,
              key: fn.key,
              enabled: fn.enabled,
              allowedInputTypes: fn.allowed_input_types,
              requiredCapabilities: fn.required_capabilities,
              settings: fn.settings,
              essential: PETROS_FUNCTION_CATALOG.find((f) => f.key === fn.key)?.essential ?? false,
            },
            candidates,
            rules: rules.map((r) => ({
              ...r,
              name: 'redacted-rule',
              functionId: r.function_id,
            })) as RoutingRule[],
            budget,
          });
          ordered = plan.attempts.map(routeSummary);
        } catch (error) {
          routingError = errorCode(error);
        }
        return {
          function: label(fn.key),
          enabled: fn.enabled,
          sampleInputModality: inputModality,
          configuredPrompt: label(fn.active_prompt_version),
          configuredSchema: label(fn.active_schema_version),
          activeVersionCount: active.reduce((a, v) => a + v.count, 0),
          activeVersions: active.map((v) => ({
            prompt: label(v.prompt_version),
            schema: label(v.schema_version),
          })),
          settings: numericSettings(fn.settings),
          dailyRequests: q?.daily_requests ?? 0,
          monthlyRequests: q?.monthly_requests ?? 0,
          configuredRoutes: candidates.map(routeSummary),
          overrideRoutes: routes.filter(
            (r) => r.function_id === fn.id && Object.keys(r.overrides).length,
          ).length,
          routingError,
          syntheticAttemptOrder: routingError ? undefined : ordered,
        };
      });
      add(
        'ai.function-routes',
        plans.some((p) => p.enabled && (p.routingError || p.activeVersionCount !== 1))
          ? 'WARNING'
          : 'PASS',
        'Pure production planner replayed for a fixed synthetic English context. Selection varies with owner/context/rules; no gateway/registry/provider call made.',
        plans,
      );
      const voice = plans.filter(
        (p) => p.function.startsWith('speech.') || p.function === 'interaction.spoken',
      );
      add(
        'ai.voice',
        voice.some((p) =>
          p.syntheticAttemptOrder?.some((c) => 'silentSubstitution' in c && c.silentSubstitution),
        )
          ? 'BLOCKED'
          : 'UNVERIFIED',
        'Voice policy inspected per effective candidate; actual audio quality/availability requires a separately approved audition.',
        voice,
      );
    });
  } finally {
    await db.end({ timeout: 2 });
  }
}

async function infrastructure() {
  // Only parse/return allowlisted values; invalid config reports field names, never values.
  const parsed = apiEnvSchema.safeParse(process.env);
  if (!parsed.success)
    add(
      'environment.validation',
      'WARNING',
      'Environment validation failed; invalid values redacted.',
      parsed.error.issues.map((i) => i.path.join('.')),
    );
  const configFiles = await read('packages/config/src/index.ts');
  const keys = [
    ...configFiles.matchAll(
      /^\s*((?:PETROS_\w+_ENABLED|REDIS_ENABLED|QUEUE_WORKERS_ENABLED|STUDENT_AUTH_DEV_HEADER|PETROS_AI_MODE|STUDENT_STORAGE_DRIVER)):.*$/gm,
    ),
  ].map((m) => m[1]!);
  const safe: Record<string, unknown> = {};
  for (const key of keys) {
    const raw = process.env[key];
    const field = apiEnvSchema.shape[key as keyof typeof apiEnvSchema.shape];
    const value = field?.safeParse(raw);
    safe[key] = value?.success ? value.data : 'invalid';
  }
  add(
    'environment.flags',
    'PASS',
    'Local process/.env effective flags inventoried; running deployment may differ.',
    safe,
  );
  add(
    'environment.auth',
    'WARNING',
    'Student dev-header bypass is permitted by the guard whenever the flag is set; production must disable it.',
    {
      studentDevHeader: safe.STUDENT_AUTH_DEV_HEADER,
      nodeEnv: label(process.env.NODE_ENV ?? 'development'),
      encryptionKeyConfigured: Boolean(process.env.PETROS_CREDENTIAL_ENCRYPTION_KEY),
      scannerConfigured: Boolean(process.env.PETROS_MEDIA_SCAN_URL),
      scannerTokenConfigured: Boolean(process.env.PETROS_MEDIA_SCAN_TOKEN),
    },
  );
  add(
    'scanner',
    'UNVERIFIED',
    'Scanner configuration only; no content uploaded. Guidance upload code does not call scanMedia. Production media requires an external scanner; local signature scanning is not AV.',
    { configured: Boolean(process.env.PETROS_MEDIA_SCAN_URL) },
  );
  for (const [key, fallback] of [
    ['STUDENT_STORAGE_DIR', './var/student-storage'],
    ['ATTACHMENT_STORAGE_DIR', './var/attachments'],
  ] as const) {
    try {
      const path = resolve(apiRoot, process.env[key] ?? fallback);
      const s = await stat(path);
      await access(path, constants.R_OK);
      add(
        `storage.${key}`,
        'PASS',
        'Configured API-relative local directory exists and is readable; durability/shared-volume topology and upload writes unverified.',
        { directory: s.isDirectory() },
      );
    } catch (error) {
      add(`storage.${key}`, 'UNVERIFIED', 'Storage directory unavailable; no directory created.', {
        code: errorCode(error),
      });
    }
  }
  if (offline || safe.REDIS_ENABLED !== true) {
    add(
      'redis',
      'UNVERIFIED',
      offline ? 'Redis skipped by --offline.' : 'Redis disabled; no runtime queue proof.',
    );
    return;
  }
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: true,
    enableOfflineQueue: false,
    enableReadyCheck: false,
    connectTimeout: 3000,
    commandTimeout: 3000,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
    const pong = await redis.ping();
    const queues = [];
    for (const name of [
      'imports',
      'exports',
      'reports',
      'notifications',
      'billing-sync',
      'ai',
      'maintenance',
    ]) {
      const prefix = `bull:${name}:`;
      const values = await Promise.all([
        redis.llen(`${prefix}wait`),
        redis.llen(`${prefix}active`),
        redis.zcard(`${prefix}failed`),
        redis.zcard(`${prefix}completed`),
        redis.zcard(`${prefix}delayed`),
        redis.hget(`${prefix}meta`, 'paused'),
      ]);
      queues.push({
        name,
        waiting: values[0],
        active: values[1],
        failed: values[2],
        completed: values[3],
        delayed: values[4],
        paused: values[5] === '1',
      });
    }
    add(
      'redis',
      pong === 'PONG' ? 'PASS' : 'BLOCKED',
      'Redis PING and fixed BullMQ metadata keys read; no enqueue, lock, Lua or health marker writes.',
      queues,
    );
    try {
      const clients = String(await redis.client('LIST')).split('\n');
      add(
        'queue.workers',
        'UNVERIFIED',
        'Read-only client snapshot; connection presence is not successful job execution.',
        {
          bullNamedConnections: clients.filter((c) => /name=bull:/.test(c)).length,
          blockedConsumers: clients.filter((c) => /cmd=(bzpopmin|brpoplpush|blmove)/.test(c))
            .length,
          workersFlag: safe.QUEUE_WORKERS_ENABLED,
        },
      );
    } catch (error) {
      add('queue.workers', 'UNVERIFIED', 'Redis client inspection unavailable.', {
        code: errorCode(error),
      });
    }
  } catch (error) {
    add('redis', 'UNVERIFIED', 'Redis unreachable/denied; no raw endpoint/error displayed.', {
      code: errorCode(error),
    });
  } finally {
    redis.disconnect();
  }
}

function syntheticPdf(): Buffer {
  const stream = 'BT /F1 18 Tf 50 750 Td (Petros M0 synthetic public PDF baseline) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const start = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(body);
}

async function formats() {
  try {
    const result = await new KnowledgePdfProcess().extract(
      syntheticPdf(),
      new AbortController().signal,
    );
    const valid =
      result.pages.length === 1 &&
      result.pages[0]?.includes('Petros M0 synthetic public PDF baseline');
    add(
      'format.pdf',
      valid ? 'PASS' : 'BLOCKED',
      'Synthetic clean one-page PDF parsed by the existing isolated worker; no real source content read.',
      {
        pages: result.pages.length,
        expectedText: valid,
        fileHashMatches: result.fileSha256 === hash(syntheticPdf()),
      },
    );
  } catch (error) {
    add(
      'format.pdf',
      'BLOCKED',
      'Existing isolated PDF worker could not parse synthetic digital PDF.',
      { code: errorCode(error) },
    );
  }
  try {
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Petros M0 synthetic slide baseline</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    );
    const result = await new MaterialDocumentPreviewService().create({
      filename: 'synthetic.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    });
    add(
      'format.pptx',
      result.readable && result.sections[0]?.text?.includes('Petros M0 synthetic slide baseline')
        ? 'PASS'
        : 'BLOCKED',
      'Synthetic OOXML text fixture exercised through current preview parser; this is not full deck/render fidelity.',
      { readable: result.readable, sections: result.sections.length },
    );
  } catch (error) {
    add('format.pptx', 'BLOCKED', 'Synthetic PPTX text parser unavailable.', {
      code: errorCode(error),
    });
  }
  const bins = [
    process.env.MATERIAL_PREVIEW_CONVERTER_BIN,
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
    'soffice',
  ].filter(Boolean) as string[];
  let converter = false;
  for (const bin of bins) {
    try {
      const r = await run(bin, ['--version'], {
        timeout: 5000,
        maxBuffer: 8192,
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C' },
      });
      const version = /LibreOffice\s+[0-9.]+/.exec(r.stdout)?.[0];
      if (version) {
        converter = true;
        add(
          'converter.binary',
          'PASS',
          'Converter version command completed with credentials excluded.',
          { version },
        );
        break;
      }
    } catch {
      /* Never print executable errors. */
    }
  }
  if (!converter)
    add(
      'converter.binary',
      'UNVERIFIED',
      'No converter version could be verified; no installation attempted.',
    );
  add(
    'format.ppt-isolation',
    'BLOCKED',
    'Current PPT/PPTX converter inherits app environment and lacks OS network/filesystem/CPU isolation. Legacy cloud PPT and full slide rendering are not admitted by M0.',
    { converterPresent: converter, legacySourceParsed: false },
  );
  add(
    'format.coverage',
    'WARNING',
    'PDF worker emits flat page text; PPTX preview emits slide paragraphs. Geometry, shape IDs, notes/table semantics, bounded ZIP expansion, selective OCR and immutable content units are not established.',
  );
}

async function main() {
  if (args.has('--help')) {
    process.stdout.write(
      'Read-only M0 inventory. Options: --offline --compact --strict --help. JSON goes to stdout; redirect to a new external file. No migrations, application bootstrap, provider calls or database writes.\n',
    );
    return;
  }
  const unknown = [...args].filter((a) => !['--offline', '--compact', '--strict'].includes(a));
  if (unknown.length) throw new Error('INVALID_ARGUMENTS');
  // Match API root .env loading while preserving explicitly provided process values.
  dotenv.config({ path: join(root, '.env'), override: false });
  const local = await localInventory();
  await databaseInventory(local);
  await infrastructure();
  await formats();
  add(
    'baseline.journeys',
    'UNVERIFIED',
    'This inventory does not mutate sessions/goals or certify browser/provider journeys. Run the documented existing regression/disposable suites and attach their observed results.',
  );
  process.stdout.write(
    JSON.stringify(
      {
        schemaVersion: 'petros-v2-readiness.m0.v1',
        observedAt: new Date().toISOString(),
        scope: 'M0 only',
        safety: {
          databaseReadOnly: true,
          migrationCredentialUsed: false,
          providerCalls: 0,
          scannerUploads: 0,
          queueWrites: 0,
          studentContentSelected: false,
        },
        findings,
        totals: Object.fromEntries(
          ['PASS', 'WARNING', 'BLOCKED', 'UNVERIFIED'].map((s) => [
            s,
            findings.filter((f) => f.status === s).length,
          ]),
        ),
      },
      null,
      2,
    ) + '\n',
  );
  if (args.has('--strict') && findings.some((f) => f.status === 'BLOCKED')) process.exitCode = 1;
}

main().catch((error) => {
  process.stdout.write(
    JSON.stringify({
      status: 'UNVERIFIED',
      code: errorCode(error),
      summary: 'Readiness inventory failed; raw errors withheld.',
    }) + '\n',
  );
  process.exitCode = 1;
});
