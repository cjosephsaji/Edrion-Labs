'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  useExamGradingStream,
  useMockExam,
  usePushRevision,
  useRetakeWeak,
  useStudentMe,
} from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import { MathText } from '@/components/learn/MathText';

export default function MockExamResultsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: me } = useStudentMe();
  const { data: exam } = useMockExam(id);
  const grading = useExamGradingStream(id);
  const retake = useRetakeWeak();
  const pushRev = usePushRevision();
  const [proposeRevision, setProposeRevision] = useState(false);

  const results = exam?.results ?? grading.results;
  const gradingBusy = exam?.gradingStatus === 'grading' || exam?.attempt?.status === 'grading';

  useEffect(() => {
    if (gradingBusy && grading.status === 'idle') grading.start();
  }, [gradingBusy, grading]);

  const persona = me?.persona ?? 'independent';
  const weakTopics = useMemo(
    () =>
      (results?.byTopic ?? [])
        .filter((t) => t.verdict === 'missed' || t.verdict === 'slipped')
        .map((t) => t.topicLabel),
    [results?.byTopic],
  );

  const onRetake = async () => {
    const next = await retake.mutateAsync(id);
    router.push(`/lab/mock-exams/${next.id}`);
  };

  const onConfirmRevision = async () => {
    if (!exam?.attempt?.id || !weakTopics.length) return;
    await pushRev.mutateAsync({ attemptId: exam.attempt.id, topicLabels: weakTopics });
    setProposeRevision(false);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/lab/mock-exams"
        backLabel="Mock exams"
        eyebrow={<Eyebrow color="amber">RESULTS</Eyebrow>}
        title={exam?.title ?? 'Results'}
        subtitle={
          persona === 'school'
            ? 'Well fought — here is the honest tally.'
            : persona === 'college'
              ? 'Attempt recorded.'
              : 'Marks and qualitative verdicts — no mastery bars.'
        }
      />

      {gradingBusy && !results?.evaluations?.length && (
        <p className="mt-6 animate-st-shimmer text-sm text-st-muted">Grading your written answers…</p>
      )}

      {results && (
        <>
          <div
            className={`mt-8 ${persona === 'school' ? 'animate-st-burst' : 'animate-st-fade-up'}`}
          >
            <p className="font-mono text-5xl font-semibold tracking-tight text-st-ink">
              {results.awardedMarks}
              <span className="text-2xl text-st-muted"> / {results.maxMarks}</span>
            </p>
            <p className="mt-1 font-mono text-xs text-st-muted">marks</p>
          </div>

          {results.bySection?.length > 0 && (
            <section className="mt-8">
              <Eyebrow>SECTIONS</Eyebrow>
              <ul className="mt-3 space-y-2">
                {results.bySection.map((s) => (
                  <li
                    key={s.sectionId}
                    className="flex justify-between rounded-[12px] border border-st-bd2 px-3 py-2 font-mono text-sm"
                  >
                    <span>{s.sectionName}</span>
                    <span>
                      {s.awardedMarks}/{s.maxMarks}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <Eyebrow>TOPIC VERDICTS</Eyebrow>
            <div className="mt-3 flex flex-wrap gap-2">
              {(results.byTopic ?? []).map((t) => (
                <span
                  key={t.topicLabel}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    t.verdict === 'solid'
                      ? 'bg-st-mintBg text-st-success'
                      : t.verdict === 'slipped'
                        ? 'bg-st-amberSoft text-st-amber'
                        : 'bg-st-dangerSoft text-st-danger'
                  }`}
                >
                  {t.topicLabel}: {t.verdict}
                </span>
              ))}
            </div>
          </section>

          {results.patterns?.length > 0 && (
            <section className="mt-8">
              <Eyebrow>PATTERNS</Eyebrow>
              <ul className="mt-3 space-y-3">
                {results.patterns.map((p, i) => (
                  <li key={i} className="rounded-[14px] border border-st-bd2 bg-st-card px-4 py-3 text-sm">
                    <p>{p.text}</p>
                    <p className="mt-1 font-mono text-xs text-st-muted">
                      Q{p.questionNumbers.join(', Q')}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <Eyebrow>REVIEW</Eyebrow>
            <ul className="mt-3 space-y-4">
              {(exam?.questions ?? []).map((q) => {
                const ev = results.evaluations?.find((e) => e.questionId === q.id);
                const ans = exam?.answers?.find((a) => a.questionId === q.id);
                return (
                  <li key={q.id} className="rounded-[14px] border border-st-bd2 bg-st-card px-4 py-4">
                    <p className="font-mono text-xs text-st-muted">
                      Q{q.sequence} · {ev?.verdict ?? '—'} · {ev?.awardedMarks ?? 0}/{q.marks}
                    </p>
                    <div className="mt-2 text-sm">
                      <MathText>{q.prompt}</MathText>
                    </div>
                    {ans && (
                      <p className="mt-2 text-sm text-st-muted">
                        Your answer:{' '}
                        {ans.choiceKey ?? ans.answerText ?? JSON.stringify(ans.payload ?? {})}
                      </p>
                    )}
                    {q.payload && typeof q.payload === 'object' && 'explanation' in q.payload && (
                      <p className="mt-2 text-sm">
                        <span className="text-st-muted">Explanation: </span>
                        {String((q.payload as { explanation?: string }).explanation)}
                      </p>
                    )}
                    {ev?.distractorRationale && (
                      <p className="mt-1 text-sm text-st-amber">Why that option tempts: {ev.distractorRationale}</p>
                    )}
                    {ev?.rubricEvidence?.map((r) => (
                      <p key={r.criterionId} className="mt-1 font-mono text-xs text-st-muted">
                        {r.criterionId}: {r.marksAwarded}/{r.marksMax} — “{r.evidenceQuote}”
                      </p>
                    ))}
                  </li>
                );
              })}
            </ul>
          </section>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <PillButton onClick={() => void onRetake()} disabled={retake.isPending || !weakTopics.length}>
              Retake weak areas
            </PillButton>
            <PillButton
              variant="ghost"
              onClick={() => setProposeRevision(true)}
              disabled={!weakTopics.length}
            >
              Add weak topics to revision
            </PillButton>
          </div>
          {results.suggestion && <p className="mt-4 text-sm text-st-muted">{results.suggestion}</p>}
        </>
      )}

      {proposeRevision && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[16px] border border-st-bd2 bg-st-card p-5 animate-st-pop-in">
            <p className="font-display text-lg font-semibold">Push to revision?</p>
            <p className="mt-2 text-sm text-st-muted">
              Petros proposes adding these topics to your revision queue. Nothing is written until you
              confirm.
            </p>
            <ul className="mt-3 list-disc pl-5 text-sm">
              {weakTopics.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <div className="mt-5 flex gap-2">
              <PillButton onClick={() => void onConfirmRevision()} disabled={pushRev.isPending}>
                Confirm
              </PillButton>
              <PillButton variant="ghost" onClick={() => setProposeRevision(false)}>
                Cancel
              </PillButton>
            </div>
          </div>
        </div>
      )}

      <p className="mt-10 text-center text-xs text-st-muted">
        Mock exam attempts are private — never shared with your institution.{' '}
        <Link href="/history?filter=mock" className="underline">
          History
        </Link>
      </p>
    </div>
  );
}
