'use client';
import { useMemo } from 'react';
import { useEffectiveSettings } from './settings';

const LOCALE_FOR_NUMBER: Record<string, string> = { en: 'en-US', eu: 'de-DE', in: 'en-IN' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Format a Date per one of the registry's date-format presets. */
function formatDate(d: Date, fmt: string): string {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  switch (fmt) {
    case 'dd/MM/yyyy':
      return `${pad(day)}/${pad(m + 1)}/${y}`;
    case 'MM/dd/yyyy':
      return `${pad(m + 1)}/${pad(day)}/${y}`;
    case 'd MMM yyyy':
      return `${day} ${MONTHS[m]} ${y}`;
    case 'yyyy-MM-dd':
    default:
      return `${y}-${pad(m + 1)}-${pad(day)}`;
  }
}

/**
 * Formatting fed by the institution's effective global settings (admin-redesign Phase 6): one place
 * that turns currency / date-format / time-format / number-format settings into functions, so a
 * change in Settings updates fees, dates and numbers everywhere they use this hook.
 */
export function useFormat() {
  const { data } = useEffectiveSettings();
  return useMemo(() => {
    const v = data?.values ?? {};
    const currency = (v.currency as string) || 'USD';
    const dateFormat = (v.dateFormat as string) || 'yyyy-MM-dd';
    const timeFormat = (v.timeFormat as string) || '24h';
    const numberFormat = (v.numberFormat as string) || 'en';
    const locale = LOCALE_FOR_NUMBER[numberFormat] || 'en-US';

    // The currency's symbol (₹, $, €…) for labels/adornments. Falls back to the ISO code.
    let currencySymbol = currency;
    try {
      const part = new Intl.NumberFormat(locale, { style: 'currency', currency })
        .formatToParts(0)
        .find((p) => p.type === 'currency');
      if (part) currencySymbol = part.value;
    } catch {
      /* keep ISO code */
    }

    return {
      currency,
      currencySymbol,
      /** Format minor units (cents) as the institution's currency. */
      money(minor: number | null | undefined): string {
        if (minor == null) return '—';
        try {
          return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
        } catch {
          return `${currency} ${(minor / 100).toFixed(2)}`;
        }
      },
      number(n: number | null | undefined): string {
        if (n == null) return '—';
        return new Intl.NumberFormat(locale).format(n);
      },
      /** Format an ISO date/datetime string using the institution's date format. */
      date(iso: string | null | undefined): string {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        return formatDate(d, dateFormat);
      },
      /** Format an ISO datetime's time part per the 12h/24h setting. */
      time(iso: string | null | undefined): string {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
      },
      dateTime(iso: string | null | undefined): string {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso);
        return `${formatDate(d, dateFormat)} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' })}`;
      },
    };
  }, [data]);
}
