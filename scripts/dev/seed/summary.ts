import type { DevLoginRow } from './_context.js';

export function printLoginSummary(logins: DevLoginRow[]): void {
  const cols = {
    email: 'Email',
    password: 'Password',
    role: 'Role',
    url: 'URL',
  } as const;

  const widths = {
    email: Math.max(cols.email.length, ...logins.map((r) => r.email.length)),
    password: Math.max(cols.password.length, ...logins.map((r) => r.password.length)),
    role: Math.max(cols.role.length, ...logins.map((r) => r.role.length)),
    url: Math.max(cols.url.length, ...logins.map((r) => r.url.length)),
  };

  const pad = (v: string, w: number) => v.padEnd(w);
  const header = `${pad(cols.email, widths.email)}  ${pad(cols.password, widths.password)}  ${pad(cols.role, widths.role)}  ${cols.url}`;
  const rule = '-'.repeat(header.length);

  // eslint-disable-next-line no-console
  console.log('\nDev login summary\n');
  // eslint-disable-next-line no-console
  console.log(header);
  // eslint-disable-next-line no-console
  console.log(rule);
  for (const row of logins) {
    // eslint-disable-next-line no-console
    console.log(
      `${pad(row.email, widths.email)}  ${pad(row.password, widths.password)}  ${pad(row.role, widths.role)}  ${row.url}`,
    );
  }
  // eslint-disable-next-line no-console
  console.log('');
}
