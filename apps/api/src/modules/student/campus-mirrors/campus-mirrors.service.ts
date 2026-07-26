import { ForbiddenException, Inject, Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import type { StudentPrincipal } from '../student.types';
import { IdentityTokenService } from './identity-token.service';

const holdSchema = z.object({ bookId: z.string().uuid() });

@Injectable()
export class CampusMirrorsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly features: FeatureControlsService,
    private readonly identity: IdentityTokenService,
  ) {}

  private requireInstitutional(p: StudentPrincipal) {
    if (p.kind !== 'institutional') {
      throw new ForbiddenException({ code: 'INSTITUTION_ONLY', message: 'Campus mirrors require an institution student.' });
    }
    return p;
  }

  async listHolds(p: StudentPrincipal) {
    const principal = this.requireInstitutional(p);
    return this.db
      .select()
      .from(schema.libraryHolds)
      .where(eq(schema.libraryHolds.studentId, principal.studentId))
      .orderBy(desc(schema.libraryHolds.createdAt));
  }

  async placeHold(p: StudentPrincipal, body: unknown) {
    const principal = this.requireInstitutional(p);
    const allowed = await this.features.resolveByKey('campus_library.holds', {
      institutionId: principal.institutionId,
      campusId: principal.campusId ?? undefined,
      institutionUserId: principal.institutionUserId,
    });
    if (!allowed.value) throw new ForbiddenException({ code: 'OFF', message: 'Campus library holds disabled.' });
    const parsed = holdSchema.parse(body);
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const [row] = await this.db
      .insert(schema.libraryHolds)
      .values({
        institutionId: principal.institutionId,
        campusId: principal.campusId!,
        studentId: principal.studentId,
        bookId: parsed.bookId,
        expiresAt: expires,
      })
      .returning();
    return row;
  }

  async transportAssignment(p: StudentPrincipal) {
    const principal = this.requireInstitutional(p);
    const [row] = await this.db
      .select()
      .from(schema.transportAssignments)
      .where(
        and(
          eq(schema.transportAssignments.studentId, principal.studentId),
          eq(schema.transportAssignments.status, 'active'),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async recentBroadcasts(p: StudentPrincipal) {
    const principal = this.requireInstitutional(p);
    return this.db
      .select()
      .from(schema.transportTripBroadcasts)
      .where(eq(schema.transportTripBroadcasts.institutionId, principal.institutionId))
      .orderBy(desc(schema.transportTripBroadcasts.sentAt))
      .limit(20);
  }

  async idCard(p: StudentPrincipal) {
    const principal = this.requireInstitutional(p);
    const [card] = await this.db
      .select()
      .from(schema.studentIdCards)
      .where(
        and(
          eq(schema.studentIdCards.studentId, principal.studentId),
          eq(schema.studentIdCards.status, 'active'),
        ),
      )
      .limit(1);
    if (!card) throw new NotFoundException({ code: 'NO_CARD', message: 'No active ID card.' });
    const token = await this.identity.issueToken(principal.studentId, principal.institutionId, card.tokenVersion);
    return { card, token };
  }

  async refreshIdToken(p: StudentPrincipal) {
    return this.idCard(p);
  }

  async listEvents(p: StudentPrincipal) {
    const principal = this.requireInstitutional(p);
    const now = new Date();
    return this.db
      .select()
      .from(schema.campusEvents)
      .where(
        and(
          eq(schema.campusEvents.institutionId, principal.institutionId),
          eq(schema.campusEvents.status, 'published'),
          gte(schema.campusEvents.startsAt, now),
        ),
      )
      .orderBy(schema.campusEvents.startsAt)
      .limit(40);
  }

  async registerForEvent(p: StudentPrincipal, eventId: string) {
    const principal = this.requireInstitutional(p);
    const [event] = await this.db
      .select()
      .from(schema.campusEvents)
      .where(
        and(
          eq(schema.campusEvents.id, eventId),
          eq(schema.campusEvents.institutionId, principal.institutionId),
          eq(schema.campusEvents.status, 'published'),
        ),
      )
      .limit(1);
    if (!event) throw new BadRequestException({ code: 'NOT_FOUND', message: 'Event not found.' });

    if (event.capacity != null) {
      const [{ count }] = await this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.eventRegistrations)
        .where(
          and(
            eq(schema.eventRegistrations.eventId, eventId),
            eq(schema.eventRegistrations.status, 'registered'),
          ),
        );
      if (count >= event.capacity) {
        throw new ConflictException({ code: 'FULL', message: 'Event is full.' });
      }
    }

    const [row] = await this.db
      .insert(schema.eventRegistrations)
      .values({ eventId, studentId: principal.studentId, status: 'registered' })
      .onConflictDoNothing()
      .returning();

    if (row) return { registrationId: row.id, status: row.status };
    const [existing] = await this.db
      .select()
      .from(schema.eventRegistrations)
      .where(
        and(
          eq(schema.eventRegistrations.eventId, eventId),
          eq(schema.eventRegistrations.studentId, principal.studentId),
        ),
      )
      .limit(1);
    return { registrationId: existing!.id, status: existing!.status };
  }
}
