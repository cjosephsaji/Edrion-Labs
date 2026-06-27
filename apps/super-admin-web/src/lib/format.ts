/**
 * Money is integer minor units everywhere on the wire (see ARCHITECTURE.md §6). Format only
 * at the edge. Currency is optional: campus rows carry no currency (it lives on the
 * subscription), so the directory shows a plain decimal; the charge preview DOES carry a
 * currency and renders the symbol.
 */
export function formatMinor(minor: number, currency?: string): string {
  const major = minor / 100;
  if (currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(major);
    } catch {
      // Unknown ISO code — fall through to the plain decimal.
    }
  }
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    major,
  );
}

/** Basis points → human percentage, e.g. 1800 → "18%". */
export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}
