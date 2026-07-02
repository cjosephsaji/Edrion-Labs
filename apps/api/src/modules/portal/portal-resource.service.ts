import { PortalCrudEngine, type CrudConfig, type CrudListQuery, type RefSpec } from './portal-crud.engine';
import type { PortalActionContext } from './portal-action-context';

/**
 * Base class for the Phase-13 functional-staff module services. A subclass declares its resources as
 * a `configs` map (resourceKey → CrudConfig) and inherits scope/version/audit-correct CRUD via the
 * shared PortalCrudEngine. Controllers pass the literal resource key + the permission decorator does
 * the gating; the service never branches on a role.
 */
export abstract class PortalResourceService {
  protected abstract readonly configs: Record<string, CrudConfig>;

  constructor(protected readonly crud: PortalCrudEngine) {}

  private cfg(key: string): CrudConfig {
    const c = this.configs[key];
    if (!c) throw new Error(`Unknown portal resource: ${key}`);
    return c;
  }

  list(key: string, ctx: PortalActionContext, q: CrudListQuery) {
    return this.crud.list(this.cfg(key), ctx, q);
  }

  get(key: string, ctx: PortalActionContext, id: string) {
    return this.crud.get(this.cfg(key), ctx, id);
  }

  create(key: string, ctx: PortalActionContext, input: Record<string, unknown>) {
    return this.crud.create(this.cfg(key), ctx, input);
  }

  update(key: string, ctx: PortalActionContext, id: string, input: Record<string, unknown>) {
    const { version, ...patch } = input as { version: number } & Record<string, unknown>;
    return this.crud.update(this.cfg(key), ctx, id, version, patch);
  }

  remove(key: string, ctx: PortalActionContext, id: string, version: number) {
    return this.crud.remove(this.cfg(key), ctx, id, version);
  }
}

/** Compact CrudConfig builder — fills the standard columns from a table with the portal shape. */
export function resourceConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  opts: {
    module: string;
    entityType: string;
    actionPrefix: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    search: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sortable: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snapshot?: (row: any) => Record<string, unknown>;
    auditReads?: boolean;
    /** Declarative FK→display enrichment (see CrudConfig.refs). */
    refs?: RefSpec[];
    /** Bespoke enrichment run after refs (see CrudConfig.enrich). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    enrich?: (rows: any[], ctx: PortalActionContext) => Promise<any[]>;
  },
): CrudConfig {
  return {
    table,
    columns: {
      id: table.id,
      institutionId: table.institutionId,
      campusId: table.campusId,
      version: table.version,
      createdAt: table.createdAt,
      status: table.status,
    },
    module: opts.module,
    entityType: opts.entityType,
    actionPrefix: opts.actionPrefix,
    search: opts.search,
    sortable: opts.sortable,
    snapshot: opts.snapshot,
    auditReads: opts.auditReads,
    refs: opts.refs,
    enrich: opts.enrich,
  };
}
