'use client';
import { makeCrudHooks } from './admin';

/** A school expense row as returned by GET /portal/expenses. */
export interface ExpenseRow {
  id: string;
  version: number;
  title: string;
  category: string;
  vendor: string | null;
  /** Minor units (paise/cents). */
  amount: number;
  method: string;
  reference: string | null;
  expenseDate: string | null;
  status: string;
  notes: string | null;
  campusId: string | null;
  createdAt: string;
}

/** Scope-aware CRUD hooks for school expenses (money out; Finance Manager). */
export const { useList: useExpensesList, useMutations: useExpensesMutations } = makeCrudHooks('expenses');
