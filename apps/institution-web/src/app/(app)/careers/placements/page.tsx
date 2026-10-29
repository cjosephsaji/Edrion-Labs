'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button, ErrorState, Input, Label, Select, Skeleton } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';

type Season = { id: string; name: string; status: string };
type Company = { id: string; name: string; sector: string | null };
type DriveRow = {
  drive: { id: string; title: string; status: string };
  company: { name: string };
  season: { name: string };
};
type AppRow = {
  application: { id: string; status: string; submittedAt: string | null };
  drive: { title: string };
  company: { name: string };
  student: { firstName: string; lastName: string };
};

export default function PlacementsPage() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const [seasonName, setSeasonName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [driveTitle, setDriveTitle] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const seasons = useQuery({
    queryKey: ['portal', 'placements', 'seasons'],
    queryFn: () => client.get<Season[]>('/portal/placements/seasons', scope),
  });
  const companies = useQuery({
    queryKey: ['portal', 'placements', 'companies'],
    queryFn: () => client.get<Company[]>('/portal/placements/companies', scope),
  });
  const drives = useQuery({
    queryKey: ['portal', 'placements', 'drives'],
    queryFn: () => client.get<DriveRow[]>('/portal/placements/drives', scope),
  });
  const applications = useQuery({
    queryKey: ['portal', 'placements', 'applications'],
    queryFn: () => client.get<AppRow[]>('/portal/placements/applications', scope),
  });

  const seasonId = selectedSeasonId || seasons.data?.[0]?.id || '';
  const companyId = selectedCompanyId || companies.data?.[0]?.id || '';

  const createSeason = useMutation({
    mutationFn: () => client.post('/portal/placements/seasons', scope, { name: seasonName }),
    onSuccess: () => {
      setSeasonName('');
      setFormError(null);
      qc.invalidateQueries({ queryKey: ['portal', 'placements', 'seasons'] });
    },
    onError: (err) => setFormError(formatPortalError(err)),
  });
  const createCompany = useMutation({
    mutationFn: () =>
      client.post<{ id: string }>('/portal/placements/companies', scope, { name: companyName }),
    onSuccess: (row) => {
      setSelectedCompanyId(row.id);
      setCompanyName('');
      setFormError(null);
      qc.invalidateQueries({ queryKey: ['portal', 'placements', 'companies'] });
    },
    onError: (err) => setFormError(formatPortalError(err)),
  });
  const createDrive = useMutation({
    mutationFn: () => {
      if (!seasonId || !companyId) throw new Error('Pick a season and company first.');
      return client.post('/portal/placements/drives', scope, {
        seasonId,
        companyId,
        title: driveTitle,
      });
    },
    onSuccess: () => {
      setDriveTitle('');
      setFormError(null);
      qc.invalidateQueries({ queryKey: ['portal', 'placements', 'drives'] });
    },
    onError: (err) => setFormError(formatPortalError(err)),
  });

  const patchStatus = useMutation({
    mutationFn: (input: { id: string; status: string }) =>
      client.patch(`/portal/placements/applications/${input.id}`, scope, { status: input.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'placements', 'applications'] }),
  });

  const seasonOptions = useMemo(() => seasons.data ?? [], [seasons.data]);
  const companyOptions = useMemo(() => companies.data ?? [], [companies.data]);

  return (
    <>
      <Topbar title="Placement cell" />
      <div className="flex flex-1 flex-col gap-4 p-5 lg:p-6">
        <p className="max-w-3xl text-sm text-text-secondary">
          Run campus recruitment: create a <strong>season</strong> (e.g. 2025–26), register{' '}
          <strong>companies</strong>, schedule <strong>drives</strong>, then track student
          applications through the funnel.
        </p>
        {formError ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            {formError}
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text-primary">New season</p>
            <Input
              className="mt-2"
              aria-label="Season name"
              placeholder="e.g. Placement 2026–27"
              value={seasonName}
              onChange={(e) => setSeasonName(e.target.value)}
            />
            <Button
              type="button"
              disabled={!seasonName.trim() || createSeason.isPending}
              onClick={() => createSeason.mutate()}
              className="mt-3"
              size="sm"
            >
              Create season
            </Button>
            {seasonOptions.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-text-muted">
                {seasonOptions.map((s) => (
                  <li key={s.id}>
                    {s.name} ({s.status})
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text-primary">New company</p>
            <Input
              className="mt-2"
              aria-label="Company name"
              placeholder="Company name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            <Button
              type="button"
              disabled={!companyName.trim() || createCompany.isPending}
              onClick={() => createCompany.mutate()}
              className="mt-3"
              size="sm"
            >
              Add company
            </Button>
            {companyOptions.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-text-muted">
                {companyOptions.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text-primary">New drive</p>
            <div className="mt-3">
              <Label htmlFor="placement-seasonId">Season</Label>
              <Select
                id="placement-seasonId"
                value={seasonId}
                onChange={(e) => setSelectedSeasonId(e.target.value)}
                placeholder="Select season"
                options={seasonOptions.map((row) => ({ value: row.id, label: row.name }))}
              />
            </div>
            <div className="mt-3">
              <Label htmlFor="placement-companyId">Company</Label>
              <Select
                id="placement-companyId"
                value={companyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                placeholder="Select company"
                options={companyOptions.map((row) => ({ value: row.id, label: row.name }))}
              />
            </div>
            <Input
              className="mt-2"
              aria-label="Drive title"
              placeholder="Drive title"
              value={driveTitle}
              onChange={(e) => setDriveTitle(e.target.value)}
            />
            <Button
              type="button"
              disabled={!driveTitle.trim() || !seasonId || !companyId || createDrive.isPending}
              onClick={() => createDrive.mutate()}
              className="mt-3"
              size="sm"
            >
              Schedule drive
            </Button>
          </div>
        </div>

        {seasons.isLoading && <Skeleton className="h-24 w-full" />}
        {seasons.isError && <ErrorState title="Could not load seasons" />}

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text-primary">Application funnel</p>
          {applications.isLoading && <Skeleton className="mt-3 h-32 w-full" />}
          {applications.isError && <ErrorState title="Could not load applications" />}
          <ul className="mt-3 space-y-2 text-sm">
            {(applications.data ?? []).map((row) => (
              <li
                key={row.application.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2"
              >
                <span>
                  {row.student.firstName} {row.student.lastName} · {row.company.name} —{' '}
                  {row.drive.title}
                </span>
                <Select
                  className="w-full sm:w-44"
                  aria-label={`Application status for ${row.student.firstName} ${row.student.lastName}`}
                  value={row.application.status}
                  onChange={(e) =>
                    patchStatus.mutate({ id: row.application.id, status: e.target.value })
                  }
                  options={['submitted', 'shortlisted', 'offered', 'rejected', 'withdrawn'].map(
                    (status) => ({
                      value: status,
                      label: status.charAt(0).toUpperCase() + status.slice(1),
                    }),
                  )}
                />
              </li>
            ))}
            {(applications.data ?? []).length === 0 && !applications.isLoading && (
              <li className="text-text-muted">
                No applications yet — students apply from the student portal once drives are open.
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text-primary">Drives</p>
          <ul className="mt-2 space-y-1 text-xs text-text-secondary">
            {(drives.data ?? []).map((row) => (
              <li key={row.drive.id}>
                {row.season.name}: {row.company.name} — {row.drive.title} ({row.drive.status})
              </li>
            ))}
            {(drives.data ?? []).length === 0 && !drives.isLoading ? (
              <li className="text-text-muted">No drives scheduled yet.</li>
            ) : null}
          </ul>
        </div>
      </div>
    </>
  );
}
