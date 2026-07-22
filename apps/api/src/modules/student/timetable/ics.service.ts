import { createHash, randomBytes } from 'node:crypto';
import {
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, isNull, schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { RedisService } from '../../../common/redis/redis.service';
import { TimetableResolverService } from './timetable-resolver.service';
import type { StudentPrincipal } from '../student.types';

const TOKEN_BYTES = 24;
const CACHE_TTL = 15 * 60;
const RATE_LIMIT = 60;

@Injectable()
export class IcsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly resolver: TimetableResolverService,
    private readonly redis: RedisService,
  ) {}

  async createOrRegenerate(principal: Extract<StudentPrincipal, { kind: 'institutional' }>) {
    const token = this.generateToken();
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.icsTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.icsTokens.studentId, principal.studentId), isNull(schema.icsTokens.revokedAt)));
      await tx.insert(schema.icsTokens).values({
        institutionId: principal.institutionId,
        studentId: principal.studentId,
        token,
      });
    });
    return { url: this.publicUrl(token) };
  }

  async revoke(principal: Extract<StudentPrincipal, { kind: 'institutional' }>) {
    await this.db
      .update(schema.icsTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.icsTokens.studentId, principal.studentId), isNull(schema.icsTokens.revokedAt)));
    return { revoked: true };
  }

  async feed(token: string): Promise<string> {
    const masked = token.slice(0, 4);
    const cacheKey = `ics:${createHash('sha256').update(token).digest('hex')}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const count = await this.redis.incrementWindow(`ics:rate:${token}`, 3600);
    if (count !== null && count > RATE_LIMIT) {
      throw new GoneException('Rate limit exceeded.');
    }

    const [row] = await this.db
      .select()
      .from(schema.icsTokens)
      .where(and(eq(schema.icsTokens.token, token), isNull(schema.icsTokens.revokedAt)))
      .limit(1);
    if (!row) {
      throw new GoneException('This calendar link was revoked. Get a new one in Edrion → Profile.');
    }

    const [student] = await this.db
      .select({ institutionUserId: schema.students.institutionUserId, campusId: schema.students.campusId })
      .from(schema.students)
      .where(eq(schema.students.id, row.studentId))
      .limit(1);
    if (!student?.institutionUserId) throw new NotFoundException();

    const [institution] = await this.db
      .select({ name: schema.institutions.displayName, timezone: schema.institutions.timezone })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, row.institutionId))
      .limit(1);

    const from = addDays(new Date(), -7);
    const to = addDays(new Date(), 56);
    const payload = await this.resolver.resolveForStudent(
      {
        kind: 'institutional',
        institutionId: row.institutionId,
        campusId: student.campusId,
        institutionUserId: student.institutionUserId,
        studentId: row.studentId,
        email: '',
        fullName: '',
        lastAuthAt: null,
        permissions: [],
      },
      from,
      to,
      { includeExams: true },
    );

    const body = this.renderIcs(payload.occurrences, institution?.name ?? 'Edrion', institution?.timezone ?? 'UTC');
    await this.redis.set(cacheKey, body, CACHE_TTL);
    await this.db
      .update(schema.icsTokens)
      .set({ lastFetchedAt: new Date() })
      .where(eq(schema.icsTokens.id, row.id));
    void masked;
    return body;
  }

  private renderIcs(
    occurrences: Array<{
      id: string;
      date: string;
      start: string;
      end: string;
      kind: string;
      subject: { name: string };
      room: { name: string | null };
      state: string;
    }>,
    institutionName: string,
    timezone: string,
  ): string {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Edrion//Timetable//EN',
      `X-WR-CALNAME:${escapeIcs(institutionName)} Timetable`,
      'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
      'X-PUBLISHED-TTL:PT1H',
    ];
    for (const occ of occurrences) {
      const summary =
        occ.kind === 'exam' ? `EXAM — ${occ.subject.name}` : occ.subject.name;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${occ.id}@edrion`,
        `DTSTART;TZID=${timezone}:${occ.date.replace(/-/g, '')}T${occ.start.replace(':', '')}00`,
        `DTEND;TZID=${timezone}:${occ.date.replace(/-/g, '')}T${occ.end.replace(':', '')}00`,
        `SUMMARY:${escapeIcs(summary)}`,
        occ.room.name ? `LOCATION:${escapeIcs(occ.room.name)}` : '',
        occ.state === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    return lines.filter(Boolean).join('\r\n');
  }

  private generateToken(): string {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const bytes = randomBytes(TOKEN_BYTES);
    let out = '';
    for (let i = 0; i < 32; i += 1) {
      out += alphabet[bytes[i % bytes.length]! % alphabet.length]!;
    }
    return out;
  }

  private publicUrl(token: string): string {
    return `/v1/student/timetable.ics?token=${token}`;
  }
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
