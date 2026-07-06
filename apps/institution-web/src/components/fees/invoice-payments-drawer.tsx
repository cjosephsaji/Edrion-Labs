'use client';
import { Drawer } from '@edrion/ui';
import type { FeeInvoiceRow } from '@/lib/fees-types';
import { InvoicePaymentsPanel } from './invoice-payments-panel';

/** @deprecated Prefer `InvoicePaymentsPanel` in the invoice detail popup. */
export function InvoicePaymentsDrawer({
  invoice,
  open,
  onClose,
}: {
  invoice: FeeInvoiceRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Payments" description={invoice ? `Invoice ${invoice.invoiceNo}` : ''}>
      {invoice && (
        <InvoicePaymentsPanel
          invoiceId={invoice.id}
          invoiceNo={invoice.invoiceNo}
          amount={invoice.amount}
          amountPaid={invoice.amountPaid}
          balance={invoice.balance}
        />
      )}
    </Drawer>
  );
}

export { InvoicePaymentsPanel } from './invoice-payments-panel';
