export function allocateOldestDue(
  amountMinor: number,
  invoices: Array<{ id: string; amount: number; amountPaid: number; status: string }>,
): { allocations: Array<{ invoiceId: string; amountMinor: number }>; remainder: number } {
  let remainder = amountMinor;
  const allocations: Array<{ invoiceId: string; amountMinor: number }> = [];
  for (const invoice of invoices) {
    const balance = Math.max(0, invoice.amount - invoice.amountPaid);
    if (!balance || remainder <= 0 || invoice.status === 'cancelled') continue;
    const allocated = Math.min(balance, remainder);
    allocations.push({ invoiceId: invoice.id, amountMinor: allocated });
    remainder -= allocated;
  }
  return { allocations, remainder };
}

export const formatReceiptNo = (fyLabel: string, sequence: number) =>
  `R/${fyLabel}/${String(sequence).padStart(6, '0')}`;
