'use client';

import { useMemo, useState } from 'react';
import { computeNeeded, computeStanding, type SchemeSnapshot } from '@edrion/schemas';
import { Drawer } from '@edrion/ui';
import type { TermSubject } from '@/lib/results';

type Props = {
  subject: TermSubject | null;
  scheme: SchemeSnapshot | null;
  onClose: () => void;
};

export function WhatIfDrawer({ subject, scheme, onClose }: Props) {
  const [targetGrade, setTargetGrade] = useState('B+');
  const [hypothetical, setHypothetical] = useState<Record<string, number>>({});

  const openComponents = useMemo(
    () => subject?.components.filter((c) => !c.released) ?? [],
    [subject],
  );

  const standing = useMemo(() => {
    if (!subject || !scheme) return null;
    const entries = subject.components
      .filter((c) => c.released)
      .map((c) => ({
        assessment_name: c.label,
        marks_obtained: c.score ?? 0,
        max_marks: c.max ?? 100,
        published: true,
      }));
    for (const component of openComponents) {
      const score = hypothetical[component.key];
      if (score !== undefined) {
        entries.push({
          assessment_name: component.label,
          marks_obtained: score,
          max_marks: component.max ?? 100,
          published: true,
        });
      }
    }
    return computeStanding(
      scheme,
      {
        credits: subject.credits_not_set ? null : (subject as TermSubject & { credits?: number }).credits ?? null,
        components: subject.components.map((c) => ({
          key: c.key,
          label: c.label,
          weight_pct: c.weight_pct,
          assessments: [{ assessment_name: c.label }],
          aggregation: 'sum' as const,
        })),
      },
      entries,
    );
  }, [subject, openComponents, hypothetical, scheme]);

  const needed = useMemo(() => {
    if (!subject || !scheme) return null;
    return computeNeeded(
      scheme,
      {
        credits: subject.credits_not_set ? null : (subject as TermSubject & { credits?: number }).credits ?? null,
        components: subject.components.map((c) => ({
          key: c.key,
          label: c.label,
          weight_pct: c.weight_pct,
          assessments: [{ assessment_name: c.label }],
          aggregation: 'sum' as const,
        })),
      },
      subject.components
        .filter((c) => c.released)
        .map((c) => ({
          assessment_name: c.label,
          marks_obtained: c.score ?? 0,
          max_marks: c.max ?? 100,
          published: true,
        })),
      targetGrade,
    );
  }, [subject, targetGrade, scheme]);

  if (!scheme) return null;

  return (
    <Drawer
      open={Boolean(subject)}
      onClose={onClose}
      title={subject ? `${subject.subject_name_snapshot} — what do I need?` : 'What do I need?'}
      description="Estimate — final grades are set by your institution."
    >
      {subject && standing ? (
        <div className="space-y-4">
          <p className="text-sm">
            Current standing: <strong>{standing.grade}</strong> ({standing.weighted_pct}%)
          </p>
          <label className="block text-sm">
            Target grade
            <select
              className="mt-1 w-full rounded border border-st-bd1 bg-st-card p-2"
              value={targetGrade}
              onChange={(e) => setTargetGrade(e.target.value)}
            >
              {scheme.bands.map((band) => (
                <option key={band.grade} value={band.grade}>
                  {band.grade}
                </option>
              ))}
            </select>
          </label>
          {needed && !needed.achievable ? (
            <p className="text-sm text-st-muted">
              Not reachable — highest possible is <strong>{needed.best_possible_grade}</strong>.
            </p>
          ) : null}
          {needed?.achievable && needed.needed.length === 1 ? (
            <p className="text-sm">
              You need <strong>≥ {needed.needed[0]!.needed_score}/{needed.needed[0]!.max}</strong> in{' '}
              {openComponents[0]?.label}.
            </p>
          ) : null}
          {openComponents.slice(0, 3).map((component) => (
            <label key={component.key} className="block text-sm">
              {component.label}
              <input
                type="range"
                min={0}
                max={component.max ?? 100}
                value={hypothetical[component.key] ?? 0}
                onChange={(e) =>
                  setHypothetical((prev) => ({
                    ...prev,
                    [component.key]: Number(e.target.value),
                  }))
                }
                className="mt-1 w-full"
              />
            </label>
          ))}
        </div>
      ) : null}
    </Drawer>
  );
}
