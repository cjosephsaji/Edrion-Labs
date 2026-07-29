import type { Database } from '@edrion/database';

export const DEV_PASSWORD = 'password';

export const URLS = {
  superAdmin: 'http://localhost:3000',
  institution: 'http://localhost:3002',
  parent: 'http://localhost:3004',
  student: 'http://localhost:3005',
} as const;

export interface DevLoginRow {
  email: string;
  password: string;
  role: string;
  url: string;
}

export interface DevSeedContext {
  db: Database;
  logins: DevLoginRow[];
}

export function registerLogin(ctx: DevSeedContext, row: DevLoginRow): void {
  const existing = ctx.logins.findIndex((r) => r.email === row.email);
  if (existing >= 0) ctx.logins[existing] = row;
  else ctx.logins.push(row);
}

export const GREENWOOD_PUBLIC_ID = 'INST-GWD-00001';
