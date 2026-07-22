import { createHash } from 'node:crypto';

/** Deterministic fingerprint of template body + config at render time. */
export function templateFingerprint(input: {
  html: string;
  css: string;
  headerConfig: unknown;
  fieldsSchema: unknown;
}): string {
  const payload = JSON.stringify({
    html: input.html,
    css: input.css,
    headerConfig: input.headerConfig ?? {},
    fieldsSchema: input.fieldsSchema ?? {},
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
