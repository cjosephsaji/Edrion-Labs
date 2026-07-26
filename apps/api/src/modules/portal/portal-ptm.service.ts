import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import type { InstitutionPrincipal } from '@edrion/auth';

@Injectable()
export class PortalPtmService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listEvents(principal: InstitutionPrincipal) {
    return this.db
      .select()
      .from(schema.parentPtmEvents)
      .where(eq(schema.parentPtmEvents.institutionId, principal.institutionId))
      .orderBy(desc(schema.parentPtmEvents.createdAt));
  }

  async createEvent(
    principal: InstitutionPrincipal,
    input: {
      title: string;
      description?: string;
      campusId?: string | null;
      startsOn?: string;
      endsOn?: string;
      slotLengthMinutes?: number;
    },
  ) {
    const [row] = await this.db
      .insert(schema.parentPtmEvents)
      .values({
        institutionId: principal.institutionId,
        campusId: input.campusId ?? null,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        startsOn: input.startsOn ?? null,
        endsOn: input.endsOn ?? null,
        slotLengthMinutes: input.slotLengthMinutes ?? 15,
        status: 'draft',
      })
      .returning();
    return row!;
  }

  async publishEvent(principal: InstitutionPrincipal, eventId: string) {
    const [row] = await this.db
      .update(schema.parentPtmEvents)
      .set({ status: 'published', updatedAt: new Date() })
      .where(
        and(
          eq(schema.parentPtmEvents.id, eventId),
          eq(schema.parentPtmEvents.institutionId, principal.institutionId),
        ),
      )
      .returning();
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'PTM event not found.' });
    return row;
  }

  async listSlots(principal: InstitutionPrincipal, eventId: string) {
    return this.db
      .select({
        slot: schema.parentPtmSlots,
        teacherFirst: schema.staff.firstName,
        teacherLast: schema.staff.lastName,
      })
      .from(schema.parentPtmSlots)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.parentPtmSlots.teacherId))
      .where(
        and(
          eq(schema.parentPtmSlots.eventId, eventId),
          eq(schema.parentPtmSlots.institutionId, principal.institutionId),
        ),
      )
      .orderBy(schema.parentPtmSlots.startsAt);
  }

  async listBookings(principal: InstitutionPrincipal, eventId: string) {
    return this.db
      .select({
        booking: schema.parentPtmBookings,
        student: schema.students,
        slot: schema.parentPtmSlots,
      })
      .from(schema.parentPtmBookings)
      .innerJoin(schema.students, eq(schema.parentPtmBookings.studentId, schema.students.id))
      .innerJoin(schema.parentPtmSlots, eq(schema.parentPtmBookings.slotId, schema.parentPtmSlots.id))
      .where(
        and(
          eq(schema.parentPtmBookings.eventId, eventId),
          eq(schema.parentPtmBookings.institutionId, principal.institutionId),
        ),
      )
      .orderBy(schema.parentPtmSlots.startsAt);
  }

  async addSlot(
    principal: InstitutionPrincipal,
    eventId: string,
    input: { teacherId: string; startsAt: string; endsAt: string; capacity?: number },
  ) {
    const [event] = await this.db
      .select()
      .from(schema.parentPtmEvents)
      .where(
        and(
          eq(schema.parentPtmEvents.id, eventId),
          eq(schema.parentPtmEvents.institutionId, principal.institutionId),
        ),
      )
      .limit(1);
    if (!event) throw new NotFoundException({ code: 'NOT_FOUND', message: 'PTM event not found.' });
    if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
      throw new BadRequestException({ code: 'INVALID_SLOT', message: 'Slot end must be after start.' });
    }

    const [row] = await this.db
      .insert(schema.parentPtmSlots)
      .values({
        institutionId: principal.institutionId,
        eventId,
        teacherId: input.teacherId,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        capacity: input.capacity ?? 1,
      })
      .returning();
    return row!;
  }
}
