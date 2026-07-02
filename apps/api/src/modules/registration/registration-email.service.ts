import { Injectable } from '@nestjs/common';
import { EmailService, type SentEmail } from '../portal/email.service';

/**
 * Branded transactional emails for the registration funnel. Templates are plain functions that
 * return `{subject,text,html}` and dispatch through the shared {@link EmailService} seam (real SMTP
 * when configured, structured-log transport otherwise). The visual language mirrors the public
 * registration page: warm ivory canvas, dark-green brand, generous spacing, rounded card.
 */

const BRAND = {
  ivory: '#FBF7EF',
  card: '#FFFFFF',
  green: '#14532D',
  greenSoft: '#E7F0EA',
  ink: '#1C2B24',
  muted: '#5B6B62',
  border: '#E4DCCB',
};

function layout(opts: { heading: string; bodyHtml: string; preheader?: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${BRAND.ivory};">
  ${opts.preheader ? `<span style="display:none;opacity:0;color:${BRAND.ivory};">${opts.preheader}</span>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.ivory};padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:92%;">
        <tr><td style="padding:0 8px 20px;">
          <span style="font:700 20px/1.2 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND.green};letter-spacing:-.2px;">Edrion</span>
        </td></tr>
        <tr><td style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;padding:32px;">
          <h1 style="margin:0 0 16px;font:700 22px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">${opts.heading}</h1>
          <div style="font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND.muted};">${opts.bodyHtml}</div>
        </td></tr>
        <tr><td style="padding:20px 8px;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${BRAND.muted};">
          You're receiving this because an institution registration was started with this email at Edrion.
          If this wasn't you, you can safely ignore it.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND.green};color:#fff;text-decoration:none;font:600 14px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:13px 22px;border-radius:10px;">${label}</a>`;
}

@Injectable()
export class RegistrationEmailService {
  constructor(private readonly email: EmailService) {}

  sendOtp(to: string, code: string): Promise<SentEmail> {
    const text = `Your Edrion verification code is ${code}. It expires in 10 minutes. Do not share it with anyone.`;
    const html = layout({
      heading: 'Verify your email',
      preheader: 'Your Edrion verification code',
      bodyHtml: `<p style="margin:0 0 18px;">Use the code below to verify your email and continue your institution registration. It expires in <strong>10 minutes</strong>.</p>
        <div style="margin:8px 0 18px;text-align:center;background:${BRAND.greenSoft};border-radius:12px;padding:18px;">
          <span style="font:700 34px/1 -apple-system,SFMono-Regular,Menlo,monospace;letter-spacing:10px;color:${BRAND.green};">${code}</span>
        </div>
        <p style="margin:0;">For your security, never share this code. Edrion staff will never ask you for it.</p>`,
    });
    return this.email.send({ to, subject: `Your Edrion verification code: ${code}`, text, html });
  }

  sendSubmitted(to: string, displayName: string, publicRef: string): Promise<SentEmail> {
    const text = `Thank you — your registration for ${displayName} has been received. Reference: ${publicRef}. Our onboarding team will review it and email you with the outcome.`;
    const html = layout({
      heading: 'Application received',
      preheader: `Reference ${publicRef}`,
      bodyHtml: `<p style="margin:0 0 16px;">Thank you for your interest in Edrion. We've received the registration for <strong>${displayName}</strong>.</p>
        <p style="margin:0 0 8px;">Your reference number:</p>
        <div style="margin:0 0 18px;background:${BRAND.greenSoft};border-radius:12px;padding:14px 18px;font:700 18px/1 -apple-system,SFMono-Regular,Menlo,monospace;color:${BRAND.green};">${publicRef}</div>
        <p style="margin:0;">Our onboarding team will review your request and email you once the review is complete. No action is needed from you right now.</p>`,
    });
    return this.email.send({ to, subject: `We've received your Edrion application (${publicRef})`, text, html });
  }

  sendApproved(to: string, displayName: string): Promise<SentEmail> {
    const text = `Great news — the registration for ${displayName} has been approved. Your administrator will receive a separate invitation email to set up access and begin onboarding.`;
    const html = layout({
      heading: 'Your application is approved 🎉',
      preheader: `${displayName} is approved`,
      bodyHtml: `<p style="margin:0 0 16px;">Welcome to Edrion! The registration for <strong>${displayName}</strong> has been approved and your workspace is being prepared.</p>
        <p style="margin:0 0 16px;">Your nominated administrator will receive a separate invitation email with steps to activate their account and start onboarding your institution.</p>
        <p style="margin:0;">We're delighted to have you on board.</p>`,
    });
    return this.email.send({ to, subject: `${displayName} has been approved on Edrion`, text, html });
  }

  sendRejected(to: string, displayName: string, reason: string): Promise<SentEmail> {
    const text = `Thank you for your interest in Edrion. After review, we're unable to approve the registration for ${displayName} at this time. Reason: ${reason}. You're welcome to reply to this email if you'd like to discuss further.`;
    const html = layout({
      heading: 'Update on your application',
      preheader: `Decision on ${displayName}`,
      bodyHtml: `<p style="margin:0 0 16px;">Thank you for your interest in Edrion and for taking the time to apply for <strong>${displayName}</strong>.</p>
        <p style="margin:0 0 8px;">After careful review, we're unable to approve this registration at this time.</p>
        <div style="margin:0 0 18px;background:${BRAND.greenSoft};border-radius:12px;padding:14px 18px;color:${BRAND.ink};">${reason}</div>
        <p style="margin:0;">If you believe this was in error or your circumstances change, simply reply to this email — we're happy to help.</p>`,
    });
    return this.email.send({ to, subject: `Update on your Edrion application for ${displayName}`, text, html });
  }

  sendAdminInvitation(
    to: string,
    fullName: string,
    displayName: string,
    loginUrl: string,
    temporaryPassword?: string,
  ): Promise<SentEmail> {
    const credLine = temporaryPassword
      ? `Sign in at ${loginUrl} with this email and the temporary password: ${temporaryPassword} (you'll be asked to change it).`
      : `Activate your account and set your password here: ${loginUrl}`;
    const text = `Hi ${fullName}, you've been set up as the administrator for ${displayName} on Edrion. ${credLine}`;
    const credHtml = temporaryPassword
      ? `<p style="margin:0 0 8px;">Your temporary password:</p>
         <div style="margin:0 0 18px;background:${BRAND.greenSoft};border-radius:12px;padding:14px 18px;font:700 16px/1 -apple-system,SFMono-Regular,Menlo,monospace;color:${BRAND.green};">${temporaryPassword}</div>
         <p style="margin:0 0 18px;">You'll be asked to change it the first time you sign in.</p>
         ${button(loginUrl, 'Sign in to Edrion')}`
      : `<p style="margin:0 0 18px;">Click below to activate your account and set your password.</p>${button(loginUrl, 'Activate your account')}`;
    const html = layout({
      heading: `You're the administrator for ${displayName}`,
      preheader: 'Set up your Edrion administrator account',
      bodyHtml: `<p style="margin:0 0 16px;">Hi ${fullName}, you've been set up as the primary administrator for <strong>${displayName}</strong> on Edrion.</p>${credHtml}`,
    });
    return this.email.send({ to, subject: `Activate your Edrion administrator account`, text, html });
  }

  sendPasswordReset(to: string, fullName: string, resetUrl: string): Promise<SentEmail> {
    const text = `Hi ${fullName}, we received a request to reset your Edrion password. Use this link to choose a new one (it expires in 1 hour): ${resetUrl}. If you didn't request this, you can safely ignore this email.`;
    const html = layout({
      heading: 'Reset your password',
      preheader: 'Choose a new Edrion password',
      bodyHtml: `<p style="margin:0 0 16px;">Hi ${fullName}, we received a request to reset the password on your Edrion account.</p>
        <p style="margin:0 0 18px;">Click below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
        ${button(resetUrl, 'Reset your password')}
        <p style="margin:18px 0 0;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
    });
    return this.email.send({ to, subject: 'Reset your Edrion password', text, html });
  }

  sendWelcome(to: string, displayName: string, loginUrl: string): Promise<SentEmail> {
    const text = `Welcome to Edrion! ${displayName} is now in onboarding. Sign in any time at ${loginUrl} to track your onboarding checklist.`;
    const html = layout({
      heading: 'Welcome to Edrion',
      preheader: `${displayName} onboarding has started`,
      bodyHtml: `<p style="margin:0 0 16px;">We're thrilled to welcome <strong>${displayName}</strong> to Edrion. Your onboarding has begun and a checklist is waiting in your workspace.</p>
        <p style="margin:0 0 18px;">Sign in any time to track progress through configuration, training and go-live.</p>${button(loginUrl, 'Open your workspace')}`,
    });
    return this.email.send({ to, subject: `Welcome to Edrion, ${displayName}`, text, html });
  }
}
