'use client';

import { useQuery } from '@tanstack/react-query';
import { ReceiptText, WalletCards } from 'lucide-react';
import { QueryPage } from '@/components/query-page';
import { ActionLink, Card, PageHeader, StatTile, StatusPill, type StatusTone } from '@/components/design-system';
import { EmptyState } from '@/components/ui/states';
import { useStudentApi } from '@/lib/api-client';

type Invoice = {
  id: string;
  label?: string | null;
  amount?: number | null;
  amountMinor?: number | null;
  dueDate?: string | null;
  status?: string | null;
  currency?: string | null;
};

type FeesPayload = {
  items: Invoice[];
  balanceMinor?: number;
  currency?: string;
};

type HistoryPayload = {
  receipts?: Array<{
    id: string;
    receiptNo?: string;
    issuedAt?: string;
  }>;
};
const pageTitle = 'Fees';
const pageDescription = 'Outstanding invoices, due dates, and your payment history.';

export default function Page() {
  const api = useStudentApi();
  const fees = useQuery({
    queryKey: ['student', 'fees'],
    queryFn: () => api.get<FeesPayload>('/student/fees'),
  });
  const history = useQuery({
    queryKey: ['student', 'fees', 'history'],
    queryFn: () => api.get<HistoryPayload>('/student/fees/history'),
  });

  return (
    <QueryPage query={fees}>
      {(data) => {
        const items = data.items ?? [];
        const outstanding = items.filter((i) => (i.amountMinor ?? 0) > 0);
        const balance =
          data.balanceMinor != null
            ? `${data.currency ?? ''} ${(data.balanceMinor / 100).toLocaleString()}`.trim()
            : null;
        const hist = history.data;
        const statusTone = (status?: string | null): StatusTone => {
          const value = status?.toLowerCase() ?? '';
          if (value.includes('overdue') || value.includes('failed')) return 'critical';
          if (value.includes('paid') || value.includes('settled')) return 'positive';
          if (value.includes('due') || value.includes('pending')) return 'warning';
          return 'neutral';
        };

        return (
          <div className="mx-auto w-full max-w-[1120px]">
            <PageHeader
              eyebrow="Account · Fees"
              title={pageTitle}
              description={pageDescription}
              actions={
                outstanding.length > 0 ? (
                  <ActionLink href="/fees/pay">Pay fees</ActionLink>
                ) : null
              }
            />

            {items.length === 0 ? (
              <EmptyState
                icon={WalletCards}
                title="No fee records"
                description="Invoices appear when your institution posts them."
              />
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
                  <StatTile
                    label="Outstanding balance"
                    value={balance ?? 'All clear'}
                    supporting={outstanding.length ? `${outstanding.length} open ${outstanding.length === 1 ? 'invoice' : 'invoices'}` : 'No payment is currently due'}
                    prominence={outstanding.length ? 'primary' : 'quiet'}
                    tone={outstanding.length ? 'critical' : 'positive'}
                  />
                  <Card variant={outstanding.length ? 'urgent' : 'positive'} density="roomy">
                    <p className="text-xs uppercase tracking-[.1em] text-[var(--s-muted)]">What needs attention</p>
                    <h2 className="mt-3 text-2xl text-[var(--s-ink)]">{outstanding.length ? 'Review the oldest invoice first' : 'Your account is settled'}</h2>
                    <p className="mt-2 max-w-[62ch] text-base leading-7 text-[var(--s-muted)]">{outstanding.length ? 'Your institution may require older balances to be included before newer invoices can be paid.' : 'New invoices will appear here with their amount and due date before any action is required.'}</p>
                  </Card>
                </div>

                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {items.map((item) => {
                    const tone = statusTone(item.status);
                    const amount = item.amount != null
                      ? `${item.currency ?? data.currency ?? ''} ${item.amount.toLocaleString()}`.trim()
                      : item.amountMinor != null
                        ? `${item.currency ?? data.currency ?? ''} ${(item.amountMinor / 100).toLocaleString()}`.trim()
                        : 'Amount pending';
                    return (
                      <li key={item.id}>
                        <Card variant={tone === 'critical' ? 'urgent' : tone === 'positive' ? 'positive' : 'default'} className="min-h-[166px]">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-lg font-semibold text-[var(--s-ink)]">{item.label ?? 'Invoice'}</p>
                            <StatusPill label={item.status ?? 'Published'} tone={tone} />
                          </div>
                          <p className="mt-6 text-3xl leading-none text-[var(--s-ink)]">{amount}</p>
                          <p className="mt-3 text-sm text-[var(--s-muted)]">{item.dueDate ? `Due ${new Date(item.dueDate).toLocaleDateString()}` : 'No due date published'}</p>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {(hist?.receipts?.length ?? 0) > 0 ? (
              <section className="mt-8">
                <div className="flex items-center gap-3"><ReceiptText className="h-5 w-5 text-[var(--s-muted)]" /><h2 className="text-2xl text-[var(--s-ink)]">Receipts</h2></div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(hist?.receipts ?? []).map((r) => (
                  <Card key={r.id} density="compact">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-[var(--s-ink)]">Receipt {r.receiptNo ?? r.id}</p>
                        <p className="mt-1 text-sm text-[var(--s-muted)]">
                          {r.issuedAt ? new Date(r.issuedAt).toLocaleString() : '—'}
                        </p>
                      </div>
                      <a
                        href={api.fileUrl(`/student/fees/receipts/${r.id}/file`)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-[var(--s-accentDeep)]"
                      >
                        View PDF
                      </a>
                    </div>
                  </Card>
                ))}
                </div>
              </section>
            ) : null}
          </div>
        );
      }}
    </QueryPage>
  );
}
