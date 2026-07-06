/**
 * Parent-Portal demo seed. Idempotent. Attaches guardian logins + a representative row in every new
 * parent-portal table to the FIRST seeded institution (created by `seed` + `seed:portal`). Exercises
 * the spec's matrix: a guardian with two children, a student with two guardians, and a guardian with
 * `visibility_overrides` that hide fees.
 *
 *   pnpm --filter @edrion/database seed:parent
 *
 * Dev login (PORTAL_AUTH_DEV_HEADER=true) via x-institution-user-email with any guardian.* email below.
 */
import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { and, asc, eq, schema as s } from './index';
import { createDatabase } from './client';

/** Dev-only bcrypt hash of the password `password` (cost 10). Never prod. */
const DEV_PASSWORD_HASH = '$2a$10$ByZT0oBbpXQboXG7ZlkzbOWfBfx9uAwu6Zf0HAt/G3yIcji9Rh.WG';

const now = () => new Date();
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

async function main() {
  const db = createDatabase();

  const inst = await db.query.institutions.findFirst({ orderBy: asc(s.institutions.createdAt) });
  if (!inst) throw new Error('No institution — run `seed` + `seed:portal` first.');
  const campus = await db.query.campuses.findFirst({
    where: eq(s.campuses.institutionId, inst.id),
    orderBy: asc(s.campuses.createdAt),
  });
  const campusId = campus?.id ?? null;

  const students = await db.query.students.findMany({
    where: eq(s.students.institutionId, inst.id),
    orderBy: asc(s.students.createdAt),
    limit: 4,
  });
  if (students.length < 3) throw new Error('Need ≥3 seeded students — run `seed` first.');
  const ward1 = students[0]!;
  const ward2 = students[1]!;
  const ward3 = students[2]!;

  const teacher = await db.query.staff.findFirst({
    where: eq(s.staff.institutionId, inst.id),
    orderBy: asc(s.staff.createdAt),
  });

  /** Create (or fetch) a guardian institution_user + parent record, return both ids. */
  async function ensureGuardian(email: string, fullName: string) {
    const parts = fullName.split(' ');
    const firstName = parts[0] ?? fullName;
    const lastName = parts.slice(1).join(' ') || 'Guardian';
    let user = await db.query.institutionUsers.findFirst({
      where: and(eq(s.institutionUsers.institutionId, inst!.id), eq(s.institutionUsers.email, email)),
    });
    if (!user) {
      const rows = await db
        .insert(s.institutionUsers)
        .values({
          institutionId: inst!.id,
          email,
          fullName,
          passwordHash: DEV_PASSWORD_HASH,
          status: 'active',
          activatedAt: now(),
          lastAuthAt: now(),
        })
        .returning();
      user = rows[0]!;
      await db
        .insert(s.institutionUserRoles)
        .values({ institutionUserId: user.id, roleKey: 'parent' })
        .onConflictDoNothing();
      if (campusId) {
        await db
          .insert(s.campusUserAccess)
          .values({ institutionUserId: user.id, campusId, accessLevel: 'view' })
          .onConflictDoNothing();
      }
    }
    let parent = await db.query.parents.findFirst({
      where: and(eq(s.parents.institutionId, inst!.id), eq(s.parents.email, email)),
    });
    if (!parent) {
      const rows = await db
        .insert(s.parents)
        .values({ institutionId: inst!.id, campusId, firstName, lastName, email, institutionUserId: user.id })
        .returning();
      parent = rows[0]!;
    }
    return { userId: user.id, parentId: parent.id };
  }

  async function link(
    parentId: string,
    studentId: string,
    relationship: string,
    opts: { isPrimary?: boolean; visibilityOverrides?: Record<string, boolean> } = {},
  ) {
    await db
      .insert(s.studentGuardians)
      .values({
        institutionId: inst!.id,
        studentId,
        parentId,
        relationship,
        isPrimary: opts.isPrimary ?? false,
        isEmergencyContact: true,
        visibilityOverrides: opts.visibilityOverrides ?? {},
      })
      .onConflictDoNothing();
  }

  // Guardian A: two children (ward1 + ward2), primary on both.
  const gA = await ensureGuardian('guardian.a@greenwood.edu', 'Anita Sharma');
  await link(gA.parentId, ward1.id, 'mother', { isPrimary: true });
  await link(gA.parentId, ward2.id, 'mother', { isPrimary: true });
  // Guardian B: second guardian of ward1.
  const gB = await ensureGuardian('guardian.b@greenwood.edu', 'Ravi Sharma');
  await link(gB.parentId, ward1.id, 'father');
  // Guardian C: ward3, but fees hidden by a visibility override (e.g. court order).
  const gC = await ensureGuardian('guardian.c@greenwood.edu', 'Meera Nair');
  await link(gC.parentId, ward3.id, 'guardian', { isPrimary: true, visibilityOverrides: { fees: true } });

  // Notification preferences for each guardian.
  for (const g of [gA, gB, gC]) {
    await db
      .insert(s.parentNotificationPreferences)
      .values({ institutionId: inst.id, guardianUserId: g.userId })
      .onConflictDoNothing();
  }

  /** Insert `values` only if no row matches `where` (idempotent demo rows). */
  async function ensureRow(
    table: keyof typeof s,
    where: unknown,
    values: Record<string, unknown>,
  ): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (s as any)[table];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (db as any).select({ id: t.id }).from(t).where(where).limit(1);
    if (existing.length) return existing[0].id as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await (db as any).insert(t).values(values).returning({ id: t.id });
    return row.id as string;
  }

  // Notice requiring acknowledgement.
  await ensureRow(
    'parentNotices',
    and(eq(s.parentNotices.institutionId, inst.id), eq(s.parentNotices.title, 'Annual Sports Day — Consent & Attendance')),
    {
      institutionId: inst.id,
      campusId,
      title: 'Annual Sports Day — Consent & Attendance',
      body: 'Our Annual Sports Day is on **Friday**. Please acknowledge and confirm your ward’s participation.',
      requiresAcknowledgement: true,
      priority: 'important',
      publishedAt: now(),
    },
  );

  // Photo/media consent form (published).
  await ensureRow(
    'parentConsentForms',
    and(eq(s.parentConsentForms.institutionId, inst.id), eq(s.parentConsentForms.title, 'Photo & Media Consent 2026')),
    {
      institutionId: inst.id,
      campusId,
      title: 'Photo & Media Consent 2026',
      description: 'Permission to use your child’s photograph in school communications.',
      consentType: 'photo_media',
      status: 'published',
      publishedAt: now(),
      dueAt: daysFromNow(14),
    },
  );

  // PTM event + a few slots for the first teacher.
  const ptmEventId = await ensureRow(
    'parentPtmEvents',
    and(eq(s.parentPtmEvents.institutionId, inst.id), eq(s.parentPtmEvents.title, 'Term 1 Parent-Teacher Meeting')),
    {
      institutionId: inst.id,
      campusId,
      title: 'Term 1 Parent-Teacher Meeting',
      description: '15-minute slots per teacher.',
      startsOn: daysFromNow(7).toISOString().slice(0, 10),
      endsOn: daysFromNow(7).toISOString().slice(0, 10),
      slotLengthMinutes: 15,
      status: 'published',
    },
  );
  if (teacher) {
    const existingSlots = await db
      .select({ id: s.parentPtmSlots.id })
      .from(s.parentPtmSlots)
      .where(eq(s.parentPtmSlots.eventId, ptmEventId))
      .limit(1);
    if (!existingSlots.length) {
      const base = daysFromNow(7);
      base.setHours(10, 0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const start = new Date(base.getTime() + i * 15 * 60_000);
        await db.insert(s.parentPtmSlots).values({
          institutionId: inst.id,
          eventId: ptmEventId,
          teacherId: teacher.id,
          startsAt: start,
          endsAt: new Date(start.getTime() + 15 * 60_000),
          capacity: 1,
        });
      }
    }
  }

  // Calendar: a holiday + an event.
  await ensureRow(
    'calendarEvents',
    and(eq(s.calendarEvents.institutionId, inst.id), eq(s.calendarEvents.title, 'Founder’s Day (Holiday)')),
    { institutionId: inst.id, campusId, title: 'Founder’s Day (Holiday)', type: 'holiday', startsOn: daysFromNow(20), allDay: true },
  );
  await ensureRow(
    'calendarEvents',
    and(eq(s.calendarEvents.institutionId, inst.id), eq(s.calendarEvents.title, 'Science Exhibition')),
    { institutionId: inst.id, campusId, title: 'Science Exhibition', type: 'event', startsOn: daysFromNow(10), allDay: true },
  );

  // Recognitions for ward1 (celebrated).
  await ensureRow(
    'studentRecognitions',
    and(eq(s.studentRecognitions.studentId, ward1.id), eq(s.studentRecognitions.title, 'Mathematics Olympiad — Gold')),
    { institutionId: inst.id, campusId: ward1.campusId, studentId: ward1.id, type: 'academics', title: 'Mathematics Olympiad — Gold', description: 'First place, inter-school round.', awardedAt: now() },
  );
  await ensureRow(
    'studentRecognitions',
    and(eq(s.studentRecognitions.studentId, ward1.id), eq(s.studentRecognitions.title, 'Perfect Attendance — Term 1')),
    { institutionId: inst.id, campusId: ward1.campusId, studentId: ward1.id, type: 'merit', title: 'Perfect Attendance — Term 1', awardedAt: now() },
  );

  // Counseling disclosure for ward2 (the only counseling surface parents see).
  await ensureRow(
    'counselingDisclosures',
    eq(s.counselingDisclosures.studentId, ward2.id),
    { institutionId: inst.id, campusId: ward2.campusId, studentId: ward2.id, counselorUserId: gA.userId, counselorDisplayName: 'Cory Counselor', contactNote: 'Available Tue/Thu 2–4pm — please reach out any time.' },
  );

  // Pickup authorization (pending school verification).
  await ensureRow(
    'pickupAuthorizations',
    and(eq(s.pickupAuthorizations.studentId, ward1.id), eq(s.pickupAuthorizations.personName, 'Sunil Sharma (Uncle)')),
    { institutionId: inst.id, campusId: ward1.campusId, studentId: ward1.id, guardianUserId: gA.userId, personName: 'Sunil Sharma (Uncle)', relationship: 'uncle', phone: '+919812345678', status: 'pending_school_verification' },
  );

  // Gate exit event (drives the "ward exited" alert).
  await ensureRow(
    'gateExitEvents',
    and(eq(s.gateExitEvents.studentId, ward1.id), eq(s.gateExitEvents.type, 'exit')),
    { institutionId: inst.id, campusId: ward1.campusId, studentId: ward1.id, type: 'exit', occurredAt: now(), pickupPerson: 'Anita Sharma' },
  );

  // Health profile (parent-maintained) for ward1.
  await ensureRow(
    'parentHealthProfiles',
    eq(s.parentHealthProfiles.studentId, ward1.id),
    { institutionId: inst.id, campusId: ward1.campusId, studentId: ward1.id, bloodGroup: 'O+', allergies: ['Peanuts'], dietaryRestrictions: 'Vegetarian', doctorName: 'Dr. Rao', doctorPhone: '+919800000000', emergencyContacts: [{ name: 'Anita Sharma', relationship: 'mother', phone: '+919812345678' }], revision: 1 },
  );

  // Published report card document for ward1.
  await ensureRow(
    'studentDocuments',
    and(eq(s.studentDocuments.studentId, ward1.id), eq(s.studentDocuments.title, 'Term 1 Report Card')),
    { institutionId: inst.id, campusId: ward1.campusId, studentId: ward1.id, type: 'report_card', title: 'Term 1 Report Card', fileRef: 'seed/report-cards/ward1-term1.pdf', contentType: 'application/pdf', issuedAt: now(), published: true },
  );

  // Pending document request (bonafide) from Guardian A.
  await ensureRow(
    'documentRequests',
    and(eq(s.documentRequests.studentId, ward1.id), eq(s.documentRequests.type, 'bonafide')),
    { institutionId: inst.id, campusId: ward1.campusId, studentId: ward1.id, guardianUserId: gA.userId, type: 'bonafide', note: 'Needed for passport application.', status: 'requested' },
  );

  // Pending profile-change request (address) from Guardian A.
  await ensureRow(
    'profileChangeRequests',
    and(eq(s.profileChangeRequests.studentId, ward1.id), eq(s.profileChangeRequests.fieldGroup, 'address')),
    { institutionId: inst.id, campusId: ward1.campusId, studentId: ward1.id, guardianUserId: gA.userId, fieldGroup: 'address', proposedChanges: { address: '42 New Colony, Bengaluru 560001' }, status: 'submitted' },
  );

  // Absence note (submitted) for ward1.
  await ensureRow(
    'parentAbsenceNotes',
    and(eq(s.parentAbsenceNotes.studentId, ward1.id), eq(s.parentAbsenceNotes.reasonCategory, 'illness')),
    { institutionId: inst.id, campusId: ward1.campusId, studentId: ward1.id, guardianUserId: gA.userId, dateFrom: daysFromNow(-2).toISOString().slice(0, 10), dateTo: daysFromNow(-1).toISOString().slice(0, 10), reasonCategory: 'illness', note: 'Fever — rested at home.', status: 'submitted' },
  );

  // Fee invoices for ward1: an open tuition invoice + a library fine (unified fees view).
  await ensureRow(
    'feeInvoices',
    and(eq(s.feeInvoices.institutionId, inst.id), eq(s.feeInvoices.invoiceNo, 'PP-TUITION-0001')),
    { institutionId: inst.id, campusId: ward1.campusId, invoiceNo: 'PP-TUITION-0001', studentId: ward1.id, source: 'tuition', amount: 4500000, amountPaid: 0, status: 'pending', issueDate: daysFromNow(-5).toISOString().slice(0, 10), dueDate: daysFromNow(10).toISOString().slice(0, 10) },
  );
  await ensureRow(
    'feeInvoices',
    and(eq(s.feeInvoices.institutionId, inst.id), eq(s.feeInvoices.invoiceNo, 'PP-FINE-0001')),
    { institutionId: inst.id, campusId: ward1.campusId, invoiceNo: 'PP-FINE-0001', studentId: ward1.id, source: 'fine', amount: 5000, amountPaid: 0, status: 'overdue', issueDate: daysFromNow(-20).toISOString().slice(0, 10), dueDate: daysFromNow(-6).toISOString().slice(0, 10) },
  );

  // Transport incident (only if a route exists).
  const route = await db.query.transportRoutes?.findFirst?.({ where: eq(s.transportRoutes.institutionId, inst.id) });
  if (route) {
    await ensureRow(
      'transportIncidents',
      and(eq(s.transportIncidents.institutionId, inst.id), eq(s.transportIncidents.routeId, route.id)),
      { institutionId: inst.id, campusId, routeId: route.id, type: 'delay', description: 'Running ~20 min late due to roadworks.', affectsDate: now().toISOString().slice(0, 10), status: 'open' },
    );
  }

  // Publish a behaviour incident to guardians (reuses student_incidents) if one exists for a ward.
  const incident = await db.query.studentIncidents?.findFirst?.({ where: eq(s.studentIncidents.studentId, ward1.id) });
  if (incident) {
    await db
      .update(s.studentIncidents)
      .set({ notifyGuardians: true, publishedAt: now(), parentAckRequired: true })
      .where(eq(s.studentIncidents.id, incident.id));
  }

  // eslint-disable-next-line no-console
  console.log('✓ Parent-portal demo seed complete. Guardians: guardian.a/b/c@greenwood.edu (pw: password)');
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
