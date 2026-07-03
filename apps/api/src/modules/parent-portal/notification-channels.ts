import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../portal/email.service';

/** A rendered notification ready for a channel. */
export interface ChannelPayload {
  to: { email?: string | null };
  title: string;
  body?: string | null;
  deepLink?: string | null;
}

export interface ChannelResult {
  channel: string;
  status: 'sent' | 'skipped' | 'failed';
  error?: string;
}

export interface NotificationChannel {
  readonly key: string;
  send(payload: ChannelPayload): Promise<ChannelResult>;
}

/** Email via the shared token-styled transactional seam (real; SMTP or dev log transport). */
@Injectable()
export class EmailChannel implements NotificationChannel {
  readonly key = 'email';
  constructor(private readonly email: EmailService) {}

  async send(payload: ChannelPayload): Promise<ChannelResult> {
    if (!payload.to.email) return { channel: this.key, status: 'skipped', error: 'no_email' };
    try {
      const link = payload.deepLink ? `\n\nOpen: ${payload.deepLink}` : '';
      await this.email.send({
        to: payload.to.email,
        subject: payload.title,
        text: `${payload.body ?? payload.title}${link}`,
        html: renderEmailHtml(payload),
      });
      return { channel: this.key, status: 'sent' };
    } catch (err) {
      return { channel: this.key, status: 'failed', error: (err as Error).message };
    }
  }
}

/**
 * Web Push. Structured adapter: to go live it needs a push-subscription store + VAPID keys
 * (WEB_PUSH_VAPID_*). Until then it logs in dev so the fanout path is exercised end-to-end.
 */
@Injectable()
export class WebPushChannel implements NotificationChannel {
  readonly key = 'push';
  private readonly logger = new Logger(WebPushChannel.name);
  async send(payload: ChannelPayload): Promise<ChannelResult> {
    this.logger.debug(`[web-push] ${payload.title} → ${payload.deepLink ?? ''}`);
    return { channel: this.key, status: 'sent' };
  }
}

/** SMS — typed stub (logs in dev). Swap in Twilio/MSG91 behind this seam. */
@Injectable()
export class SmsChannel implements NotificationChannel {
  readonly key = 'sms';
  private readonly logger = new Logger(SmsChannel.name);
  async send(payload: ChannelPayload): Promise<ChannelResult> {
    this.logger.debug(`[sms] ${payload.title}`);
    return { channel: this.key, status: 'sent' };
  }
}

/** WhatsApp — typed stub (logs in dev). */
@Injectable()
export class WhatsAppChannel implements NotificationChannel {
  readonly key = 'whatsapp';
  private readonly logger = new Logger(WhatsAppChannel.name);
  async send(payload: ChannelPayload): Promise<ChannelResult> {
    this.logger.debug(`[whatsapp] ${payload.title}`);
    return { channel: this.key, status: 'sent' };
  }
}

function renderEmailHtml(p: ChannelPayload): string {
  const btn = p.deepLink
    ? `<p style="margin:24px 0"><a href="${p.deepLink}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-family:sans-serif">Open in the app</a></p>`
    : '';
  return `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,Segoe UI,sans-serif;color:#0f172a">
  <h2 style="font-size:18px">${escapeHtml(p.title)}</h2>
  <p style="font-size:15px;line-height:1.5;color:#334155">${escapeHtml(p.body ?? '')}</p>
  ${btn}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
  <p style="font-size:12px;color:#94a3b8">You’re receiving this because you’re a guardian on the Edrion Parent Portal. Manage notifications in Settings.</p>
</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
