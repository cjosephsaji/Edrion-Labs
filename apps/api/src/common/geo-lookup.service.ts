import { Injectable } from '@nestjs/common';
import type { EdrionRequestContext } from './request-context';

/** Best-effort IP geolocation for public funnels (country, city, timezone). */
@Injectable()
export class GeoLookupService {
  /**
   * Guess location from the request IP via ipwho.is. Returns only ISO-safe fields; region is
   * omitted because providers return names, not ISO 3166-2 codes.
   */
  async detectLocation(
    reqCtx: EdrionRequestContext,
  ): Promise<{ country?: string; city?: string; timezone?: string }> {
    const ip = reqCtx.ip;
    if (!ip || isPrivateIp(ip)) return {};
    try {
      const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return {};
      const j = (await res.json()) as {
        success?: boolean;
        country_code?: unknown;
        city?: unknown;
        timezone?: { id?: unknown };
      };
      if (!j?.success) return {};
      return {
        country: typeof j.country_code === 'string' ? j.country_code : undefined,
        city: typeof j.city === 'string' ? j.city : undefined,
        timezone: typeof j.timezone?.id === 'string' ? j.timezone.id : undefined,
      };
    } catch {
      return {};
    }
  }
}

/** Loopback / RFC-1918 / link-local / ULA — no point asking a geo provider about these. */
function isPrivateIp(ip: string): boolean {
  const v = ip.trim().replace(/^::ffff:/i, '');
  if (v === '127.0.0.1' || v === '::1' || v === 'localhost' || v === '0.0.0.0') return true;
  if (/^10\./.test(v)) return true;
  if (/^192\.168\./.test(v)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (/^169\.254\./.test(v)) return true;
  if (/^(fc|fd|fe80)/i.test(v)) return true;
  return false;
}
