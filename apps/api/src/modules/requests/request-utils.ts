import { BadRequestException } from '@nestjs/common';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function codeSuffix(bytes: Uint8Array, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i % bytes.length]! % CODE_ALPHABET.length];
  return out;
}

export function addWorkingDays(start: Date, days: number, holidays: ReadonlySet<string> = new Set()): Date {
  const out = new Date(start);
  let remaining = Math.max(0, days);
  while (remaining > 0) {
    out.setUTCDate(out.getUTCDate() + 1);
    const calendarDate = out.toISOString().slice(0, 10);
    if (out.getUTCDay() !== 0 && !holidays.has(calendarDate)) remaining -= 1;
  }
  return out;
}

export function dateDiffDays(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00.000Z`);
  const b = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid date range.' });
  }
  return Math.floor((b - a) / 86_400_000);
}

export type Cursor = { at: string; id: string };

export function encodeCursor(value: Cursor): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor(value: string | undefined): Cursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (!parsed.at || !parsed.id || Number.isNaN(new Date(parsed.at).getTime())) throw new Error();
    return parsed;
  } catch {
    throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Invalid pagination cursor.' });
  }
}
