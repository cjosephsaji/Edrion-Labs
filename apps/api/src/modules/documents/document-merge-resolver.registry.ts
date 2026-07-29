import { MERGE_RESOLVER_VERSION, familyFromDocType, type DocumentFamily } from '@edrion/schemas';
import { computeTermAggregate } from '@edrion/schemas';

export type MergeResolveContext = {
  institution: {
    name: string;
    address?: string;
    affiliation?: string;
    logo?: string;
  };
  student?: {
    name: string;
    regNo?: string;
    program?: string;
    classSection?: string;
    yearOrGrade?: string;
    dob?: string;
    guardianName?: string;
    academicYear?: string;
    photo?: string;
  };
  issueDate?: string;
  verifyCode: string;
  verifyQrDataUrl?: string;
  request?: Record<string, unknown>;
  payment?: Record<string, unknown>;
  exam?: Record<string, unknown>;
  term?: { name: string; academicYear?: string };
  marks?: {
    scholasticTable: Array<Record<string, unknown>>;
    coScholasticTable?: Array<Record<string, unknown>>;
    gradeLegend?: Array<Record<string, unknown>>;
    entries?: Array<{
      subjectId: string;
      marksObtained: number;
      maxMarks: number;
      credits?: number | null;
    }>;
  };
  attendance?: { presentDays?: number; totalDays?: number; percent?: number };
  remarks?: { classTeacher?: string };
  card?: Record<string, unknown>;
  signatures?: Record<string, string>;
};

export { MERGE_RESOLVER_VERSION };

/** Code-defined sample fixture for preview renders — never filed to vault. */
export function sampleMergeData(family: DocumentFamily | string): MergeResolveContext {
  const f = (DOCUMENT_FAMILIES_SET.has(family as DocumentFamily)
    ? family
    : familyFromDocType(String(family))) as DocumentFamily;
  return {
    institution: {
      name: 'Sample Institution',
      address: '1 Education Road',
      affiliation: 'Sample Board',
    },
    student: {
      name: 'Asha Kumar',
      regNo: 'REG-0001',
      program: 'B.Sc',
      classSection: '9A',
      academicYear: '2025-26',
    },
    issueDate: new Date().toISOString().slice(0, 10),
    verifyCode: 'SAMPLE-0000',
    request: { purpose: 'Embassy submission', copies: 1 },
    payment: {
      receiptNo: 'RCPT-1',
      amount: '1500.00',
      amountWords: 'One thousand five hundred only',
      mode: 'UPI',
      date: new Date().toISOString().slice(0, 10),
      lineItems: [{ label: 'Tuition', amount: '1500.00' }],
    },
    exam: {
      seriesName: 'Term 1 Exams',
      scheduleTable: [{ subject: 'Maths', date: '2026-03-01', time: '09:00' }],
      instructions: 'Bring admit card and ID.',
    },
    term: { name: 'Term 1', academicYear: '2025-26' },
    marks: {
      scholasticTable: [
        { subject: 'Maths', max: 100, obtained: 88, grade: 'A' },
        { subject: 'Science', max: 100, obtained: 76, grade: 'B+' },
      ],
      entries: [
        { subjectId: 'math', marksObtained: 88, maxMarks: 100, credits: 4 },
        { subjectId: 'sci', marksObtained: 76, maxMarks: 100, credits: 4 },
      ],
      gradeLegend: [
        { grade: 'A', minPct: 80 },
        { grade: 'B+', minPct: 70 },
      ],
    },
    attendance: { presentDays: 85, totalDays: 90, percent: 94.4 },
    remarks: { classTeacher: 'Consistent effort.' },
    card: { validFrom: '2025-06-01', validTo: '2026-05-31' },
    ...(f === 'report_card' ? {} : {}),
  };
}

const DOCUMENT_FAMILIES_SET = new Set([
  'certificate',
  'receipt',
  'hall_ticket',
  'id_card',
  'report_card',
  'individual_report',
]);

export function resolveMergePayload(family: DocumentFamily | string, ctx: MergeResolveContext): Record<string, unknown> {
  const f = (DOCUMENT_FAMILIES_SET.has(family as DocumentFamily)
    ? (family as DocumentFamily)
    : familyFromDocType(String(family))) as DocumentFamily;

  const base: Record<string, unknown> = {
    resolverVersion: MERGE_RESOLVER_VERSION,
    institution: ctx.institution,
    issue: { date: ctx.issueDate ?? new Date().toISOString().slice(0, 10) },
    verify: { code: ctx.verifyCode, qr: ctx.verifyQrDataUrl ?? '' },
    student: ctx.student ?? { name: '' },
    signatures: ctx.signatures ?? {},
  };

  if (f === 'certificate') {
    return { ...base, request: ctx.request ?? {} };
  }
  if (f === 'receipt') {
    return { ...base, payment: ctx.payment ?? {} };
  }
  if (f === 'hall_ticket') {
    return { ...base, exam: ctx.exam ?? {} };
  }
  if (f === 'id_card') {
    return { ...base, card: ctx.card ?? {} };
  }
  if (f === 'report_card' || f === 'individual_report') {
    const aggregate = ctx.marks?.entries
      ? computeTermAggregate({ entries: ctx.marks.entries, formula: 'gpa' })
      : null;
    return {
      ...base,
      term: ctx.term ?? { name: '' },
      marks: {
        scholasticTable: ctx.marks?.scholasticTable ?? [],
        coScholasticTable: ctx.marks?.coScholasticTable ?? [],
        gradeLegend: ctx.marks?.gradeLegend ?? [],
      },
      result: {
        total: aggregate?.totalObtained,
        percentage: aggregate?.percentage,
        grade: aggregate?.grade,
        gpa: aggregate?.gpa,
        standing: aggregate?.standing,
      },
      attendance: ctx.attendance ?? {},
      remarks: ctx.remarks ?? {},
    };
  }
  return base;
}
