import { Injectable } from '@nestjs/common';
import { schema } from '@edrion/database';
import { PortalCrudEngine, type CrudConfig } from './portal-crud.engine';
import { PortalResourceService, resourceConfig } from './portal-resource.service';

/**
 * Institution-portal School Expenses service — the money leaving the school (rent, utilities,
 * supplies, maintenance…), owned by the Finance Manager. One flat, campus-scoped, version-guarded
 * resource served by the generic PortalCrudEngine; the controller's permission decorator gates it.
 */
@Injectable()
export class ExpensesService extends PortalResourceService {
  constructor(crud: PortalCrudEngine) {
    super(crud);
  }

  protected readonly configs: Record<string, CrudConfig> = {
    expenses: resourceConfig(schema.schoolExpenses, {
      module: 'portal-expenses',
      entityType: 'school_expense',
      actionPrefix: 'expense',
      search: [
        schema.schoolExpenses.title,
        schema.schoolExpenses.vendor,
        schema.schoolExpenses.reference,
        schema.schoolExpenses.category,
      ],
      sortable: {
        title: schema.schoolExpenses.title,
        category: schema.schoolExpenses.category,
        amount: schema.schoolExpenses.amount,
        status: schema.schoolExpenses.status,
        expenseDate: schema.schoolExpenses.expenseDate,
        createdAt: schema.schoolExpenses.createdAt,
      },
      snapshot: (r) => ({ title: r.title, category: r.category, amount: r.amount, status: r.status }),
    }),
  };
}
