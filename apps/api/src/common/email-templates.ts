/** Shared branded transactional email layout — warm ivory canvas, dark-green brand, rounded card. */

export const EMAIL_BRAND = {
  ivory: '#FBF7EF',
  card: '#FFFFFF',
  green: '#14532D',
  greenSoft: '#E7F0EA',
  ink: '#1C2B24',
  muted: '#5B6B62',
  border: '#E4DCCB',
} as const;

export interface EmailLayoutOptions {
  heading: string;
  bodyHtml: string;
  preheader?: string;
  footer?: string;
}

const DEFAULT_FOOTER =
  "You're receiving this because you have an account or application with Edrion. If this wasn't you, you can safely ignore it.";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function emailLayout(opts: EmailLayoutOptions): string {
  const footer = opts.footer ?? DEFAULT_FOOTER;
  return `<!doctype html><html><body style="margin:0;padding:0;background:${EMAIL_BRAND.ivory};">
  ${opts.preheader ? `<span style="display:none;opacity:0;color:${EMAIL_BRAND.ivory};">${opts.preheader}</span>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${EMAIL_BRAND.ivory};padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:92%;">
        <tr><td style="padding:0 8px 20px;">
          <span style="font:700 20px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${EMAIL_BRAND.green};letter-spacing:-.2px;">Edrion</span>
        </td></tr>
        <tr><td style="background:${EMAIL_BRAND.card};border:1px solid ${EMAIL_BRAND.border};border-radius:16px;padding:32px;">
          <h1 style="margin:0 0 16px;font:700 22px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${EMAIL_BRAND.ink};">${opts.heading}</h1>
          <div style="font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${EMAIL_BRAND.muted};">${opts.bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:20px 8px;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${EMAIL_BRAND.muted};">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${EMAIL_BRAND.green};color:#fff;text-decoration:none;font:600 14px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:13px 22px;border-radius:10px;">${label}</a>`;
}

export function emailCodeBlock(code: string, size: 'lg' | 'md' = 'lg'): string {
  const fontSize = size === 'lg' ? '34px' : '18px';
  const letterSpacing = size === 'lg' ? '10px' : '2px';
  const padding = size === 'lg' ? '18px' : '14px 18px';
  return `<div style="margin:8px 0 18px;text-align:center;background:${EMAIL_BRAND.greenSoft};border-radius:12px;padding:${padding};">
    <span style="font:700 ${fontSize}/1 -apple-system,SFMono-Regular,Menlo,monospace;letter-spacing:${letterSpacing};color:${EMAIL_BRAND.green};">${code}</span>
  </div>`;
}

export function emailReferenceBlock(ref: string): string {
  return `<div style="margin:0 0 18px;background:${EMAIL_BRAND.greenSoft};border-radius:12px;padding:14px 18px;font:700 18px/1 -apple-system,SFMono-Regular,Menlo,monospace;color:${EMAIL_BRAND.green};">${ref}</div>`;
}
