import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student/student.types';

/**
 * Lookup lists used by the student request create form (invoices, loans, clubs, etc.).
 */
@Injectable()
export class StudentRequestOptionsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async formOptions(principal: InstitutionalStudentPrincipal) {
    const [invoices, loans, clubs, transport, gradeEntries, absences, intents, routes] =
      await Promise.all([
        this.db
          .select({
            id: schema.feeInvoices.id,
            label: schema.feeInvoices.invoiceNo,
            balanceMinor: sql<number>`${schema.feeInvoices.amount} - ${schema.feeInvoices.amountPaid}`,
            status: schema.feeInvoices.status,
            dueDate: schema.feeInvoices.dueDate,
          })
          .from(schema.feeInvoices)
          .where(
            and(
              eq(schema.feeInvoices.institutionId, principal.institutionId),
              eq(schema.feeInvoices.studentId, principal.studentId),
              sql`${schema.feeInvoices.status} <> 'cancelled'`,
              sql`${schema.feeInvoices.amount} > ${schema.feeInvoices.amountPaid}`,
            ),
          )
          .orderBy(schema.feeInvoices.dueDate),
        this.db
          .select({
            id: schema.libraryLoans.id,
            dueDate: schema.libraryLoans.dueDate,
            status: schema.libraryLoans.status,
            title: schema.libraryBooks.title,
          })
          .from(schema.libraryLoans)
          .innerJoin(schema.libraryBooks, eq(schema.libraryLoans.bookId, schema.libraryBooks.id))
          .where(
            and(
              eq(schema.libraryLoans.studentId, principal.studentId),
              eq(schema.libraryLoans.status, 'issued'),
            ),
          )
          .orderBy(desc(schema.libraryLoans.dueDate))
          .limit(50),
        this.db
          .select({
            id: schema.clubs.id,
            name: schema.clubs.name,
            description: schema.clubs.description,
          })
          .from(schema.clubs)
          .where(
            and(
              eq(schema.clubs.institutionId, principal.institutionId),
              eq(schema.clubs.active, true),
            ),
          )
          .orderBy(schema.clubs.name)
          .limit(100),
        this.db
          .select({
            assignmentId: schema.transportAssignments.id,
            routeId: schema.transportAssignments.routeId,
            routeName: schema.transportRoutes.name,
            stopName: schema.transportAssignments.stopName,
          })
          .from(schema.transportAssignments)
          .innerJoin(
            schema.transportRoutes,
            eq(schema.transportAssignments.routeId, schema.transportRoutes.id),
          )
          .where(
            and(
              eq(schema.transportAssignments.studentId, principal.studentId),
              eq(schema.transportAssignments.status, 'active'),
            ),
          )
          .limit(1)
          .then((rows) => rows[0] ?? null),
        this.db
          .select({
            gradeEntryId: schema.gradeEntries.id,
            subjectId: schema.gradeEntries.subjectId,
            subjectName: schema.subjects.name,
            currentScore: schema.gradeEntries.marksObtained,
            maxMarks: schema.gradeEntries.maxMarks,
            title: schema.gradeEntries.assessmentName,
          })
          .from(schema.gradeEntries)
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.gradeEntries.subjectId))
          .where(
            and(
              eq(schema.gradeEntries.studentId, principal.studentId),
              eq(schema.gradeEntries.published, true),
            ),
          )
          .orderBy(desc(schema.gradeEntries.updatedAt))
          .limit(50),
        this.db
          .select({
            sessionId: schema.attendanceRecords.sessionId,
            date: schema.attendanceSessions.date,
            subjectName: schema.subjects.name,
            status: schema.attendanceRecords.status,
          })
          .from(schema.attendanceRecords)
          .innerJoin(
            schema.attendanceSessions,
            eq(schema.attendanceSessions.id, schema.attendanceRecords.sessionId),
          )
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.attendanceSessions.subjectId))
          .where(
            and(
              eq(schema.attendanceRecords.studentId, principal.studentId),
              inArray(schema.attendanceRecords.status, ['absent', 'late']),
            ),
          )
          .orderBy(desc(schema.attendanceSessions.date))
          .limit(30),
        this.db
          .select({
            id: schema.parentPaymentIntents.id,
            provider: schema.parentPaymentIntents.provider,
            providerRef: schema.parentPaymentIntents.providerRef,
            amountMinor: schema.parentPaymentIntents.amount,
            status: schema.parentPaymentIntents.status,
            createdAt: schema.parentPaymentIntents.createdAt,
          })
          .from(schema.parentPaymentIntents)
          .where(
            and(
              eq(schema.parentPaymentIntents.institutionId, principal.institutionId),
              eq(schema.parentPaymentIntents.studentUserId, principal.institutionUserId),
            ),
          )
          .orderBy(desc(schema.parentPaymentIntents.createdAt))
          .limit(20),
        this.db
          .select({
            id: schema.transportRoutes.id,
            name: schema.transportRoutes.name,
          })
          .from(schema.transportRoutes)
          .where(eq(schema.transportRoutes.institutionId, principal.institutionId))
          .orderBy(schema.transportRoutes.name)
          .limit(100),
      ]);

    return {
      invoices: invoices.map((row) => ({
        id: row.id,
        label: row.label,
        balanceMinor: Number(row.balanceMinor),
        status: row.status,
        dueDate: row.dueDate,
      })),
      libraryLoans: loans.map((row) => ({
        id: row.id,
        title: row.title,
        dueDate: row.dueDate,
        status: row.status,
      })),
      clubs: clubs.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
      })),
      transportAssignment: transport,
      transportRoutes: routes,
      gradeEntries: gradeEntries.map((row) => ({
        gradeEntryId: row.gradeEntryId,
        subjectId: row.subjectId,
        subjectName: row.subjectName,
        currentScore: row.currentScore != null ? Number(row.currentScore) : 0,
        maxMarks: row.maxMarks != null ? Number(row.maxMarks) : null,
        title: row.title,
      })),
      attendanceAbsences: absences.map((row) => ({
        sessionId: row.sessionId,
        date: row.date,
        subjectName: row.subjectName,
        status: row.status,
      })),
      paymentIntents: intents.map((row) => ({
        id: row.id,
        provider: row.provider,
        providerRef: row.providerRef,
        amountMinor: row.amountMinor,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
