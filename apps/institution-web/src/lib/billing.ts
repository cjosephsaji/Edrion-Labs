'use client';
import { useQuery } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';

const INSTITUTION_SCOPE = { mode: 'institution' } as const;

/** Current Edrion subscription (read-only) — see BillingSubscriptionView on the API. */
export interface BillingSubscription {
  id: string;
  status: string;
  billingCycle: string;
  currency: string;
  priceMinor: number;
  perCampusPriceMinor: number;
  baseCampusAllowance: number;
  periodStart: string;
  periodEnd: string;
  trialEndsAt: string | null;
  cancelAt: string | null;
  plan: { key: string; name: string; description: string | null };
}

export interface BillingInvoice {
  id: string;
  number: string | null;
  status: string;
  currency: string;
  totalMinor: number;
  amountPaidMinor: number;
  amountDueMinor: number;
  periodStart: string | null;
  periodEnd: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
}

export interface BillingPlan {
  key: string;
  name: string;
  description: string | null;
  currency: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  perCampusPriceMinor: number;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Read-only tenant billing hooks (Administration). Institution-scoped (billing is not per-campus),
 * so all three use INSTITUTION_SCOPE. Gated server-side by `billing.view`.
 */
export function useBillingSubscription() {
  const client = usePortalClient();
  return useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => client.get<{ subscription: BillingSubscription | null }>('/portal/billing/subscription', INSTITUTION_SCOPE),
  });
}

export function useBillingInvoices(page = 1, pageSize = 20) {
  const client = usePortalClient();
  return useQuery({
    queryKey: ['billing', 'invoices', page, pageSize],
    queryFn: () =>
      client.get<Paged<BillingInvoice>>(`/portal/billing/invoices?page=${page}&pageSize=${pageSize}`, INSTITUTION_SCOPE),
  });
}

export function useBillingPlans() {
  const client = usePortalClient();
  return useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => client.get<{ plans: BillingPlan[] }>('/portal/billing/plans', INSTITUTION_SCOPE),
    staleTime: 5 * 60_000,
  });
}

/** Format minor units in the row's OWN currency (Edrion invoices/plans carry their currency). */
export function formatMoney(minor: number | null | undefined, currency: string): string {
  if (minor == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}
