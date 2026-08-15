"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  BrainCircuit,
  DatabaseZap,
  Download,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Card, ErrorState, Skeleton } from "@edrion/ui";
import {
  usePetrosLearnerDiagnostic,
  useRebuildPetrosLearnerModel,
  useSyncPetrosLearnerSources,
} from "@edrion/api-client";
import { Topbar } from "@/components/app-shell/topbar";
import { webEnv } from "@/lib/env";

export default function PetrosLearnerModelPage() {
  const [institutionId, setInstitutionId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [topicId, setTopicId] = useState("integration-by-parts");
  const query = usePetrosLearnerDiagnostic({
    institutionId,
    studentId,
    topicId: topicId || undefined,
  });
  const rebuild = useRebuildPetrosLearnerModel();
  const sourceSync = useSyncPetrosLearnerSources();
  const model = query.data;

  async function recompute() {
    if (
      !model ||
      !window.confirm(
        "Recompute this learner from immutable raw evidence? The action is permissioned and audited.",
      )
    )
      return;
    const reason = window.prompt("Rebuild reason (minimum 8 characters):");
    if (!reason) return;
    await rebuild.mutateAsync({
      institutionId,
      studentId,
      algorithmVersion: model.algorithmVersion,
      reason,
      batchSize: 100,
    });
  }

  async function syncSources() {
    if (
      !model ||
      !window.confirm(
        "Sync this learner from durable quiz, mock, exam, assignment, and homework records? The operation is idempotent and audited.",
      )
    )
      return;
    const reason = window.prompt("Source-sync reason (minimum 8 characters):");
    if (!reason) return;
    await sourceSync.mutateAsync({ institutionId, studentId, reason });
  }

  return (
    <>
      <Topbar
        title="Petros Learner Models"
        actions={
          <span className="hidden text-xs text-text-muted md:inline">
            Authorized · audited · redacted by default
          </span>
        }
      />
      <main className="page-enter space-y-5 p-4 md:p-6">
        <section className="rounded-2xl border border-emerald-400/20 bg-[linear-gradient(125deg,#10291f,#173b2e_58%,#20523f)] p-5 text-white shadow-md md:p-7">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
            <BrainCircuit className="h-4 w-4" /> Structured learner diagnostics
          </p>
          <h1 className="mt-3 text-2xl font-semibold md:text-3xl">
            Trace personalization back to evidence.
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
            Inspect mastery uncertainty, move outcomes, pace/depth observations,
            error fingerprints, calibration inputs, rebuild status, and the
            exact bounded facts supplied to PLAN. This is not a student ranking
            or knowledge map.
          </p>
        </section>

        <Card className="p-4 md:p-5">
          <form
            className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              void query.refetch();
            }}
          >
            <Field
              label="Institution ID"
              value={institutionId}
              onChange={setInstitutionId}
              placeholder="UUID"
            />
            <Field
              label="Student ID"
              value={studentId}
              onChange={setStudentId}
              placeholder="UUID"
            />
            <Field
              label="Topic key"
              value={topicId}
              onChange={setTopicId}
              placeholder="integration-by-parts"
            />
            <button
              disabled={!institutionId || !studentId}
              className="self-end rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Inspect
            </button>
          </form>
          <p className="mt-3 flex items-center gap-2 text-xs text-text-muted">
            <ShieldCheck className="h-4 w-4" /> Exact institution and student
            scope is required. Every identifiable read is audited.
          </p>
        </Card>

        {query.isLoading && <Skeleton className="h-72" />}
        {query.isError && (
          <Card className="p-8">
            <ErrorState description="The learner model could not be read. Verify migration 0192 and ai.view permission." />
          </Card>
        )}
        {model && (
          <div className="space-y-4">
            <Card className="p-4 md:p-5">
              <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                <div>
                  <h2 className="font-semibold">Learner {model.studentRef}</h2>
                  <p className="mt-1 text-xs text-text-muted">
                    Institution {model.institutionRef} ·{" "}
                    {model.algorithmVersion} · last update{" "}
                    {model.lastUpdateAt
                      ? new Date(model.lastUpdateAt).toLocaleString()
                      : "none"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold"
                    href={`${webEnv.apiBaseUrl}/v1/petros-learner-model/export?institutionId=${encodeURIComponent(institutionId)}&studentId=${encodeURIComponent(studentId)}`}
                  >
                    <Download className="h-3.5 w-3.5" /> Export
                  </a>
                  <button
                    disabled={rebuild.isPending}
                    onClick={() => void recompute()}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />{" "}
                    {rebuild.isPending ? "Rebuilding…" : "Recompute"}
                  </button>
                  <button
                    disabled={sourceSync.isPending}
                    onClick={() => void syncSources()}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  >
                    <DatabaseZap className="h-3.5 w-3.5" />{" "}
                    {sourceSync.isPending
                      ? "Syncing…"
                      : "Sync assessment sources"}
                  </button>
                </div>
              </div>
              {sourceSync.data && (
                <p
                  className="mt-3 rounded-lg bg-success/10 p-3 text-xs"
                  role="status"
                >
                  Source sync scanned {sourceSync.data.totals.scanned}; accepted{" "}
                  {sourceSync.data.totals.accepted}, duplicates{" "}
                  {sourceSync.data.totals.duplicates}, failed{" "}
                  {sourceSync.data.totals.failed}.
                </p>
              )}
              {model.stale && (
                <p className="mt-3 flex items-center gap-2 rounded-lg bg-warning/10 p-3 text-xs">
                  <TriangleAlert className="h-4 w-4" /> Derived model is stale;
                  student sessions use a safe profile-first fallback.
                </p>
              )}
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Concept mastery" empty={!model.mastery.length}>
                {model.mastery.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border p-3 text-xs"
                  >
                    <div className="flex justify-between gap-3">
                      <strong>{item.conceptId}</strong>
                      <span>
                        {pct(item.masteryBasisPoints)} mastery · ±
                        {pct(item.uncertaintyBasisPoints)}
                      </span>
                    </div>
                    <p className="mt-1 text-text-muted">
                      Recall {pct(item.recallBasisPoints)} · application{" "}
                      {pct(item.applicationBasisPoints)} · n=
                      {item.evidenceCount}
                    </p>
                    <p className="mt-1 text-text-muted">
                      Sources{" "}
                      {Object.entries(item.evidenceSources)
                        .map(([key, count]) => `${key} ${count}`)
                        .join(" · ") || "none"}{" "}
                      · review{" "}
                      {item.nextReviewAt
                        ? new Date(item.nextReviewAt).toLocaleDateString()
                        : "not scheduled"}
                    </p>
                  </div>
                ))}
              </Panel>
              <Panel title="Move outcomes" empty={!model.moveOutcomes.length}>
                {model.moveOutcomes.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border p-3 text-xs"
                  >
                    <div className="flex justify-between gap-3">
                      <strong>{item.moveType.replace(/_/g, " ")}</strong>
                      <span>
                        effect {signed(item.effectivenessBasisPoints)}
                      </span>
                    </div>
                    <p className="mt-1 text-text-muted">
                      {item.topicId} · {item.profileDimension} ·{" "}
                      {item.successes} success / {item.failures} failure /{" "}
                      {item.skips} skip · n={item.sampleSize}
                    </p>
                  </div>
                ))}
              </Panel>
              <Panel title="Pace and depth" empty={!model.preference}>
                <div className="rounded-xl border border-border p-3 text-xs">
                  <strong>
                    {model.preference?.pace ?? "neutral"} pace ·{" "}
                    {model.preference?.depth ?? "neutral"} depth
                  </strong>
                  <p className="mt-1 text-text-muted">
                    Observed: {model.preference?.skipCount ?? 0} skips,{" "}
                    {model.preference?.expandCount ?? 0} expands,{" "}
                    {model.preference?.readCount ?? 0} reads,{" "}
                    {model.preference?.responseCount ?? 0} responses · n=
                    {model.preference?.evidenceCount ?? 0}
                  </p>
                  <p className="mt-1">
                    {model.preference?.minimumEvidenceMet
                      ? `Inference confidence ${pct(model.preference.confidenceBasisPoints)}`
                      : "Minimum evidence is not met; PLAN remains neutral."}
                  </p>
                </div>
              </Panel>
              <Panel title="Error fingerprints" empty={!model.errors.length}>
                {model.errors.map((item) => (
                  <details
                    key={item.id}
                    className="rounded-xl border border-border p-3 text-xs"
                  >
                    <summary className="cursor-pointer font-semibold">
                      {item.category.replace(/_/g, " ")} · {item.count} events
                    </summary>
                    <p className="mt-2 text-text-muted">
                      {item.topicId} · confidence{" "}
                      {pct(item.confidenceBasisPoints)} · evidence{" "}
                      {item.evidenceEventIds.join(", ")}
                    </p>
                  </details>
                ))}
              </Panel>
              <Panel title="Confidence calibration" empty={!model.calibration}>
                <div className="grid grid-cols-3 gap-2">
                  {model.calibration?.buckets.map((bucket) => (
                    <div
                      key={`${bucket.confidence}-${bucket.outcome}`}
                      className="rounded-lg bg-surface p-2 text-xs"
                    >
                      <strong>{bucket.confidence.replace("_", " ")}</strong>
                      <p>
                        {bucket.outcome}: {bucket.count}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-text-muted">
                  Transparent calibration{" "}
                  {pct(model.calibration?.scoreBasisPoints ?? 5_000)} ·
                  uncertainty{" "}
                  {pct(model.calibration?.uncertaintyBasisPoints ?? 10_000)} ·
                  n=
                  {model.calibration?.evidenceCount ?? 0}
                </p>
              </Panel>
              <Panel title="Exact bounded PLAN snapshot" empty={false}>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-surface p-3 text-[11px]">
                  {JSON.stringify(model.boundedSnapshot, null, 2)}
                </pre>
              </Panel>
            </div>

            <Panel
              title="Causal reconciliation"
              empty={!model.boundedSnapshot.causalFactors.length}
            >
              {model.boundedSnapshot.causalFactors.map((factor) => (
                <p key={factor} className="rounded-lg bg-primary/5 p-3 text-xs">
                  {factor}
                </p>
              ))}
              {model.planSnapshots.slice(0, 8).map((item) => (
                <details
                  key={item.id}
                  className="rounded-xl border border-border p-3 text-xs"
                >
                  <summary className="cursor-pointer font-semibold">
                    Decision {item.decisionId}
                  </summary>
                  <pre className="mt-2 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(item.snapshot, null, 2)}
                  </pre>
                </details>
              ))}
            </Panel>
            <Panel title="Jobs, quarantine, and evidence" empty={false}>
              <p className="text-xs text-text-muted">
                Jobs {model.jobs.length} · quarantined classifications{" "}
                {model.quarantine.length} · visible normalized evidence{" "}
                {model.evidence.length}
              </p>
              {model.jobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-lg border border-border p-3 text-xs"
                >
                  <strong>{job.status}</strong> · {job.processedEvents}/
                  {job.totalEvents} events · {job.id}
                </div>
              ))}
              {model.evidence.slice(-8).reverse().map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3 text-xs">
                  <strong>{item.source.replace(/_/g, ' ')}</strong> · {item.outcome} ·{' '}
                  {pct(item.creditBasisPoints)}
                  <p className="mt-1 break-all text-text-muted">
                    event {item.sourceEventId} · record {item.sourceRecordId ?? 'none'}
                  </p>
                </div>
              ))}
            </Panel>
            <Card className="p-4 text-xs text-text-muted">
              <strong className="text-text-primary">
                Retention and transfer
              </strong>
              <p className="mt-2">{model.retention.rawEvidence}</p>
              <p>{model.retention.derivedSummaries}</p>
              <p>{model.retention.transfer}</p>
            </Card>
          </div>
        )}
      </main>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="text-xs font-medium">
      <span>{label}</span>
      <input
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs"
      />
    </label>
  );
}
function Panel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-3 p-4 md:p-5">
      <h2 className="font-semibold">{title}</h2>
      {empty ? (
        <p className="text-xs text-text-muted">
          No qualified evidence. Neutral fallback applies.
        </p>
      ) : (
        children
      )}
    </Card>
  );
}
function pct(value: number) {
  return `${(value / 100).toFixed(1)}%`;
}
function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${(value / 100).toFixed(1)}%`;
}
