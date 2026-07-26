import { Injectable, Logger } from '@nestjs/common';
import { emailButton, emailLayout, escapeHtml } from '../../common/email-templates';
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
  const btn = p.deepLink ? emailButton(p.deepLink, 'Open in the app') : '';
  return emailLayout({
    heading: escapeHtml(p.title),
    preheader: escapeHtml(p.body ?? p.title),
    footer:
      "You're receiving this because you're a guardian on the Edrion Parent Portal. Manage notifications in Settings.",
    bodyHtml: `<p style="margin:0 0 18px;">${escapeHtml(p.body ?? '')}</p>${btn}`,
  });
}
