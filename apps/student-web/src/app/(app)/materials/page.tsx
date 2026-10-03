'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  CircleAlert,
  ClipboardCheck,
  Eye,
  FileText,
  FolderOpen,
  LayoutTemplate,
  NotebookText,
  Presentation,
  Search,
  Sparkles,
  SquarePen,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/design-system';
import { DocumentViewer } from '@/components/materials/document-viewer';
import { PetrosAskButton } from '@/components/petros/petros-ask-button';
import { usePetrosPage } from '@/components/petros/petros-companion-context';
import { PetrosDocumentDoor } from '@/components/petros/petros-door-button';
import { QueryPage } from '@/components/query-page';
import { EmptyState } from '@/components/ui/states';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { useStudentList } from '@/lib/hooks';
import { petrosDocumentExtractionSchema } from '@edrion/schemas';
import styles from './materials.module.css';

type Material = {
  id: string;
  title: string;
  description: string | null;
  kindLabel: string;
  weekNo: number | null;
  className: string | null;
  subjectName: string | null;
  filename: string | null;
  mimeType: string;
  publishedAt: string;
};
type Response = { items: Material[] };
type PetrosSource = {
  id: string;
  title: string;
  kind: string;
  pageCount: number | null;
  status: string;
  extractionReady: boolean;
  pagesDone: number;
  origin: Record<string, unknown> | null;
  version: number;
  updatedAt: string;
};
type PetrosSourcesResponse = { items: PetrosSource[] };

const pageTitle = 'Study materials';
const pageDescription = 'Notes, worksheets, and resources shared by your teachers.';

/** Which materials the student has opened is not something the API records, so the
 *  answer is kept per device. The copy says so rather than implying it follows them. */
const OPENED_STORAGE_KEY = 'edrion.student.materials.opened.v1';
const FORMAT_LABELS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'rtf', 'md',
  'mp3', 'mp4', 'png', 'jpg', 'jpeg', 'zip',
]);

/** The teacher's own word for the resource, tidied — never replaced. */
function displayKind(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return 'File';
  if (FORMAT_LABELS.has(trimmed.toLowerCase())) return trimmed.toUpperCase();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** Kind is carried by the glyph, so it reads the same in every theme. */
function kindIcon(raw: string): LucideIcon {
  const value = raw.toLowerCase();
  if (/check|safety/.test(value)) return ClipboardCheck;
  if (/worksheet|exercise|problem|practice|question|quiz|revision/.test(value)) return SquarePen;
  if (/template|planner/.test(value)) return LayoutTemplate;
  if (/slide|deck|presentation|ppt/.test(value)) return Presentation;
  if (/video|mp4|recording/.test(value)) return Video;
  if (/note/.test(value)) return NotebookText;
  if (/read|chapter|book|textbook/.test(value)) return BookOpen;
  return FileText;
}

type PetrosTone = 'ready' | 'working' | 'failed' | 'blocked';
type PetrosState = {
  tone: PetrosTone;
  ready: boolean;
  headline: string;
  note: string | null;
  progress: number | null;
  pages: number | null;
};

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * One reading of an ingested document, used identically for teacher materials and the
 * student's own uploads. `status: 'ready'` on its own is not enough — a document with no
 * extracted text cannot be taught from, and saying "reading pages 0/?" about it was a lie.
 */
function petrosStateOf(source: PetrosSource): PetrosState {
  const status = (source.status ?? '').toLowerCase();
  const pageCount = source.pageCount ?? null;
  const pagesDone = source.pagesDone ?? 0;

  if (status === 'error' || status === 'failed') {
    return {
      tone: 'failed',
      ready: false,
      headline: 'Petros could not read this',
      note: 'Extraction failed, so there are no pages to teach from.',
      progress: null,
      pages: null,
    };
  }
  const extraction = petrosDocumentExtractionSchema.safeParse(source.origin?.petrosExtraction);
  if (source.kind !== 'pdf' || (extraction.success && extraction.data.representation !== 'pdf_text')) {
    return {
      tone: 'blocked', ready: false, headline: 'Preview available; teaching needs preparation',
      note: 'Reliable teaching locators are not available for this format yet. You can open the original.',
      progress: null, pages: null,
    };
  }
  if ((status === 'needs_ocr_confirm' && !source.extractionReady)
    || (source.origin?.petrosExtraction != null && !extraction.success)
    || (extraction.success && (extraction.data.truncated || !extraction.data.readable))) {
    return {
      tone: 'blocked', ready: false, headline: 'Source text needs attention',
      note: 'The extraction is incomplete or unreadable. Open the original or correct the file before teaching.',
      progress: null, pages: pageCount,
    };
  }
  if (source.extractionReady) {
    const pages = pageCount ?? (pagesDone || null);
    return {
      tone: 'ready',
      ready: true,
      headline: status === 'needs_ocr_confirm' ? 'Select a readable page' : 'Text available for source check',
      note: 'Petros checks the selected PDF text before starting. Figures and teaching coverage are not yet verified.',
      progress: null,
      pages,
    };
  }
  if (status === 'ready') {
    return {
      tone: 'blocked',
      ready: false,
      headline: 'No pages extracted',
      note: 'Petros only teaches from documents whose text has been read.',
      progress: null,
      pages: null,
    };
  }
  return {
    tone: 'working',
    ready: false,
    headline: 'Petros is reading this',
    note: pageCount
      ? `${pagesDone} of ${plural(pageCount, 'page')} read`
      : `${plural(pagesDone, 'page')} read so far`,
    progress: pageCount ? Math.min(100, Math.round((pagesDone / pageCount) * 100)) : null,
    pages: pageCount,
  };
}

function publishedOn(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** Only ever called for timestamps written on this device after mount, so it cannot
 *  disagree with the server-rendered markup. */
function sinceLabel(at: number) {
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 28) return `${plural(Math.floor(days / 7), 'week')} ago`;
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function materialSourceId(source: PetrosSource) {
  const linked = source.origin?.classMaterialId;
  return typeof linked === 'string' ? linked : null;
}

export default function Page() {
  const api = useStudentApi();
  const query = useStudentList<Response>('materials', '/student/materials');
  const petrosSources = useStudentList<PetrosSourcesResponse>('petros-sources', '/student/petros/sources');
  const [context, setContext] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyPetrosReady, setOnlyPetrosReady] = useState(false);
  const [onlyUnopened, setOnlyUnopened] = useState(false);
  const [opened, setOpened] = useState<Record<string, number>>({});
  const [openedLoaded, setOpenedLoaded] = useState(false);
  const [activeMaterial, setActiveMaterial] = useState<Material | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPENED_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        const clean: Record<string, number> = {};
        for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof at === 'number' && Number.isFinite(at)) clean[id] = at;
        }
        setOpened(clean);
      }
    } catch {
      // A blocked or corrupt store just means no history — never a broken page.
    }
    setOpenedLoaded(true);
  }, []);

  const markOpened = useCallback((id: string) => {
    setOpened((current) => {
      const next = { ...current, [id]: Date.now() };
      try {
        window.localStorage.setItem(OPENED_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Not being able to remember is survivable; the download still happens.
      }
      return next;
    });
  }, []);

  usePetrosPage(
    query.data
      ? {
          title: pageTitle,
          summary: pageDescription,
          candidates: (query.data.items ?? []).map((item) => ({
            ref: item.id,
            entityType: 'material' as const,
            entityId: item.id,
            title: item.title,
            summary: [item.kindLabel, item.subjectName ?? item.className, item.weekNo ? `week ${item.weekNo}` : null]
              .filter(Boolean)
              .join(' · '),
            href: '/materials',
          })),
        }
      : null,
  );

  const resetFilters = () => {
    setContext('all');
    setSearch('');
    setOnlyPetrosReady(false);
    setOnlyUnopened(false);
  };

  return (
    <>
      <QueryPage query={query} loadingLabel="Loading study materials…">
        {(data) => {
        const items = data.items ?? [];
        const allSources = petrosSources.data?.items ?? [];
        const sourceByMaterialId = new Map<string, PetrosSource>();
        for (const source of allSources) {
          const linked = materialSourceId(source);
          if (linked) sourceByMaterialId.set(linked, source);
        }
        const uploads = allSources.filter((source) => !materialSourceId(source));

        const rows = items.map((item) => {
          const source = sourceByMaterialId.get(item.id) ?? null;
          return {
            item,
            source,
            petros: source ? petrosStateOf(source) : null,
            openedAt: opened[item.id] ?? null,
          };
        });
        type Row = (typeof rows)[number];

        const bucketOf = (m: Material) => m.subjectName ?? m.className ?? 'General';
        const collections = [...new Set(rows.map((row) => bucketOf(row.item)))];
        const queryText = search.trim().toLowerCase();
        const matchesQuery = (row: Row) =>
          !queryText ||
          [
            row.item.title,
            row.item.description,
            row.item.kindLabel,
            row.item.subjectName,
            row.item.className,
            row.item.weekNo ? `week ${row.item.weekNo}` : null,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(queryText);
        const matchesState = (row: Row) =>
          (!onlyPetrosReady || Boolean(row.petros?.ready)) && (!onlyUnopened || !row.openedAt);

        const visible = rows.filter(
          (row) =>
            (context === 'all' || bucketOf(row.item) === context) &&
            matchesQuery(row) &&
            matchesState(row),
        );
        const matchesAnywhere = rows.filter((row) => matchesQuery(row) && matchesState(row)).length;

        const petrosReadyMaterials = rows.filter((row) => row.petros?.ready).length;
        const petrosReadyUploads = uploads.filter((source) => petrosStateOf(source).ready).length;
        const unopenedCount = rows.filter((row) => !row.openedAt).length;
        const filtersActive =
          context !== 'all' || queryText.length > 0 || onlyPetrosReady || onlyUnopened;

        // Week is the axis a student actually plans against: teachers publish per week and
        // the sheet you need is the one for the week you are in. A flat grid buries that in
        // a date chip, so materials are banded by week, newest first, with anything untagged
        // gathered at the end. Bands are dropped entirely when nothing carries a week number.
        const bands = new Map<number | null, Row[]>();
        for (const row of visible) {
          const key = row.item.weekNo ?? null;
          const band = bands.get(key);
          if (band) band.push(row);
          else bands.set(key, [row]);
        }
        const bandKeys = [...bands.keys()].sort((a, b) => {
          if (a === null) return 1;
          if (b === null) return -1;
          return b - a;
        });
        const useBands = bandKeys.some((key) => key !== null);
        // Taken from the whole library, so the marker does not hop about while filtering.
        const latestWeek = rows.reduce<number | null>((max, row) => {
          const week = row.item.weekNo;
          return typeof week === 'number' && (max === null || week > max) ? week : max;
        }, null);

        const renderCard = (row: Row) => {
          const { item, source, petros, openedAt } = row;
          const Icon = kindIcon(item.kindLabel);
          const published = publishedOn(item.publishedAt);
          return (
            <li className={styles.card} key={item.id} data-petros={petros?.tone ?? 'none'}>
              <div className={styles.cardHead}>
                <span className={styles.kind}>
                  <Icon aria-hidden="true" />
                  <span className={styles.kindWord}>{displayKind(item.kindLabel)}</span>
                </span>
                <div className={styles.cardBody}>
                  <div className={styles.titleRow}>
                    <h4 className={styles.title}>{item.title}</h4>
                    {openedLoaded && !openedAt ? (
                      <span className={styles.newFlag}>Not opened</span>
                    ) : null}
                  </div>
                  {item.description ? <p className={styles.description}>{item.description}</p> : null}
                  <ul className={styles.meta}>
                    <li>
                      <FolderOpen aria-hidden="true" />
                      {item.subjectName ?? item.className ?? 'General'}
                    </li>
                    {published ? (
                      <li>
                        <CalendarDays aria-hidden="true" />
                        Shared {published}
                      </li>
                    ) : null}
                    {openedLoaded && openedAt ? (
                      <li>
                        <Eye aria-hidden="true" />
                        Opened {sinceLabel(openedAt)}
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>

              <div className={styles.actions}>
                {/* Reading remains its own control: opening a document never starts an AI session. */}
                <button
                  className={styles.open}
                  type="button"
                  aria-label={`View ${item.title} in Edrion`}
                  onClick={() => {
                    markOpened(item.id);
                    setActiveMaterial(item);
                  }}
                >
                  <Eye aria-hidden="true" />
                  <span>Open document</span>
                </button>
                <span className={styles.askSlot}>
                  <PetrosAskButton candidateRef={item.id} label={item.title} />
                </span>
              </div>

              {source && petros ? (
                <div className={styles.lane} data-tone={petros.tone}>
                  <p className={styles.laneHead}>
                    {petros.tone === 'failed' || petros.tone === 'blocked' ? (
                      <CircleAlert aria-hidden="true" />
                    ) : (
                      <Sparkles aria-hidden="true" />
                    )}
                    {petros.headline}
                  </p>
                  {petros.note ? <p className={styles.laneNote}>{petros.note}</p> : null}
                  {petros.progress === null ? null : (
                    <div
                      className={styles.track}
                      role="img"
                      aria-label={`${petros.progress}% of pages read`}
                    >
                      <span className={styles.fill} style={{ width: `${petros.progress}%` }} />
                    </div>
                  )}
                  <PetrosDocumentDoor
                    sourceId={source.id}
                    title={source.title}
                    pageCount={source.pageCount}
                    ready={petros.ready}
                  />
                </div>
              ) : null}
            </li>
          );
        };

        return (
          <div className={styles.page}>
            <PageHeader
              eyebrow="Learning library"
              title={pageTitle}
              description={pageDescription}
              actions={(
                <div className={styles.headerActions}>
                  <Link data-petros-target="library:petros" href="/petros?mode=documents" className={styles.petrosAction}>
                    <BookOpenCheck aria-hidden="true" />
                    Teach from a document
                  </Link>
                  <Link data-petros-target="library:saved" href="/petros/artifacts" className={styles.savedAction}>
                    <NotebookText aria-hidden="true" />
                    Saved study work
                  </Link>
                </div>
              )}
            />

            {items.length === 0 && !petrosSources.isLoading && !petrosSources.error && uploads.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title="No materials available"
                description="Resources your teachers publish for your class or courses appear here."
              />
            ) : (
              <>
                <section className={styles.summary} aria-label="Library at a glance">
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Materials</span>
                    <strong className={styles.statValue}>{items.length}</strong>
                    <span className={styles.statNote}>
                      Published across {plural(collections.length, 'collection')}
                    </span>
                  </div>
                  <div className={styles.stat} data-tone="accent">
                    <span className={styles.statLabel}>Ready for source check</span>
                    <strong className={styles.statValue}>
                      {petrosSources.error || petrosSources.isLoading ? '—' : petrosReadyMaterials + petrosReadyUploads}
                    </strong>
                    <span className={styles.statNote}>
                      {petrosSources.error
                        ? 'Source status is unavailable right now'
                        : petrosSources.isLoading
                          ? 'Checking current source status'
                          : 'PDF documents to check before teaching'}
                    </span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Not opened</span>
                    <strong className={styles.statValue}>
                      {openedLoaded ? unopenedCount : '—'}
                      <span className={styles.statOf}> / {items.length}</span>
                    </strong>
                    <span className={styles.statNote}>Counted on this device only</span>
                  </div>
                </section>

                <section className={styles.section} aria-labelledby="materials-published" data-petros-target="library:published">
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle} id="materials-published">
                      Published by your teachers
                    </h2>
                    <span className={styles.sectionMeta}>
                      {visible.length === items.length
                        ? plural(items.length, 'material')
                        : `${visible.length} of ${items.length} shown`}
                    </span>
                  </div>

                  <div className={styles.toolbar} data-petros-target="library:search">
                    <div className={styles.chips} role="group" aria-label="Filter by collection">
                      <button
                        className={styles.chip}
                        type="button"
                        aria-pressed={context === 'all'}
                        onClick={() => setContext('all')}
                      >
                        All
                        <span className={styles.chipCount}>{items.length}</span>
                      </button>
                      {collections.map((name) => (
                        <button
                          className={styles.chip}
                          type="button"
                          key={name}
                          aria-pressed={context === name}
                          onClick={() => setContext(name)}
                        >
                          {name}
                          <span className={styles.chipCount}>
                            {rows.filter((row) => bucketOf(row.item) === name).length}
                          </span>
                        </button>
                      ))}
                    </div>
                    <label className={styles.search}>
                      <span className="sr-only">Search study materials</span>
                      <Search aria-hidden="true" />
                      <input
                        className={styles.searchInput}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search title, kind, or week"
                      />
                    </label>
                  </div>

                  {petrosSources.error ? (
                    <p className={styles.sourceUnavailable} role="status">
                      Source preparation status is unavailable. You can still open each original document; teaching stays subject to a current source check.
                    </p>
                  ) : petrosSources.isLoading ? (
                    <p className={styles.sourceChecking} role="status">Checking current source status…</p>
                  ) : null}

                  {petrosReadyMaterials || (openedLoaded && unopenedCount) ? (
                    <div className={styles.stateRow}>
                      <span className={styles.stateRowLabel}>Show only</span>
                      {petrosReadyMaterials ? (
                        <button
                          className={styles.stateChip}
                          type="button"
                          aria-pressed={onlyPetrosReady}
                          onClick={() => setOnlyPetrosReady((value) => !value)}
                        >
                          <Sparkles aria-hidden="true" />
                          Text ready
                          <span className={styles.chipCount}>{petrosReadyMaterials}</span>
                        </button>
                      ) : null}
                      {openedLoaded && unopenedCount ? (
                        <button
                          className={styles.stateChip}
                          type="button"
                          aria-pressed={onlyUnopened}
                          onClick={() => setOnlyUnopened((value) => !value)}
                        >
                          <Eye aria-hidden="true" />
                          Not opened
                          <span className={styles.chipCount}>{unopenedCount}</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {visible.length === 0 ? (
                    <div className={styles.noResults}>
                      <h3 className={styles.noResultsTitle}>
                        {items.length === 0 && !filtersActive ? 'No teacher materials yet' : 'Nothing here matches'}
                      </h3>
                      <p className={styles.noResultsText}>
                        {items.length === 0 && !filtersActive ? (
                          'Your own Petros-ready documents are still available below.'
                        ) : (
                          <>
                            {queryText ? <>No material matches “{search.trim()}”</> : 'No material matches these filters'}
                            {context === 'all' ? '' : ` in ${context}`}
                            {onlyPetrosReady ? ', among the sources with readable text' : ''}
                            {onlyUnopened ? ', among the ones you have not opened' : ''}.
                            {context !== 'all' && matchesAnywhere > 0
                              ? ` ${plural(matchesAnywhere, 'material')} elsewhere in your library ${matchesAnywhere === 1 ? 'matches' : 'match'}.`
                              : ''}
                          </>
                        )}
                      </p>
                      <div className={styles.noResultsActions}>
                        {context !== 'all' && matchesAnywhere > 0 ? (
                          <button
                            className={styles.ghostButton}
                            type="button"
                            onClick={() => setContext('all')}
                          >
                            Search every collection
                          </button>
                        ) : null}
                        {filtersActive ? (
                          <button className={styles.ghostButton} type="button" onClick={resetFilters}>
                            Clear filters
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : useBands ? (
                    bandKeys.map((week) => {
                      const band = bands.get(week) ?? [];
                      return (
                        <section className={styles.week} key={week ?? 'unscheduled'}>
                          <div className={styles.weekHead}>
                            <h3 className={styles.weekLabel}>
                              {week === null ? 'No week set' : `Week ${week}`}
                            </h3>
                            {week !== null && week === latestWeek ? (
                              <span className={styles.weekTag}>Latest</span>
                            ) : null}
                            <span className={styles.weekRule} aria-hidden="true" />
                            <span className={styles.weekCount}>{plural(band.length, 'item')}</span>
                          </div>
                          <ul className={styles.grid}>{band.map(renderCard)}</ul>
                        </section>
                      );
                    })
                  ) : (
                    <ul className={styles.grid}>{visible.map(renderCard)}</ul>
                  )}
                </section>

                <section className={styles.section} aria-labelledby="materials-uploads">
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle} id="materials-uploads">
                      Your own documents
                    </h2>
                    <span className={styles.sectionMeta}>
                      {petrosSources.error || petrosSources.isLoading
                        ? 'Petros sources'
                        : plural(uploads.length, 'upload')}
                    </span>
                  </div>
                  {petrosSources.error ? (
                    <p className={styles.inlineError} role="alert">
                      Could not load your documents: {formatApiError(petrosSources.error)}
                    </p>
                  ) : petrosSources.isLoading ? (
                    <p className={styles.quietState}>Checking your uploads…</p>
                  ) : uploads.length === 0 ? (
                    <p className={styles.quietState}>No documents added yet.</p>
                  ) : (
                    <ul className={styles.uploads}>
                      {uploads.map((source) => {
                        const state = petrosStateOf(source);
                        const Icon = kindIcon(source.kind);
                        return (
                          <li className={styles.upload} key={source.id} data-tone={state.tone}>
                            <span className={styles.kind}>
                              <Icon aria-hidden="true" />
                              <span className={styles.kindWord}>{displayKind(source.kind)}</span>
                            </span>
                            <div className={styles.uploadBody}>
                              <div className={styles.uploadHead}>
                                <h3 className={styles.uploadTitle}>{source.title}</h3>
                                <span className={styles.pill} data-tone={state.tone}>
                                  {state.tone === 'ready'
                                    ? 'Ready'
                                    : state.tone === 'working'
                                      ? 'Reading'
                                      : state.tone === 'failed'
                                        ? 'Failed'
                                        : 'No text'}
                                </span>
                              </div>
                              <p className={styles.uploadNote}>
                                {state.note ?? state.headline}
                              </p>
                              {state.progress === null ? null : (
                                <div
                                  className={styles.track}
                                  role="img"
                                  aria-label={`${state.progress}% of pages read`}
                                >
                                  <span
                                    className={styles.fill}
                                    style={{ width: `${state.progress}%` }}
                                  />
                                </div>
                              )}
                              <PetrosDocumentDoor
                                sourceId={source.id}
                                title={source.title}
                                pageCount={source.pageCount}
                                ready={state.ready}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

              </>
            )}
          </div>
        );
        }}
      </QueryPage>
      {activeMaterial ? (
        <DocumentViewer
          material={activeMaterial}
          previewUrl={api.fileUrl(`/student/materials/${activeMaterial.id}/view`)}
          documentPreviewUrl={api.fileUrl(`/student/materials/${activeMaterial.id}/preview`)}
          downloadUrl={api.fileUrl(`/student/materials/${activeMaterial.id}/file`)}
          onClose={() => setActiveMaterial(null)}
        />
      ) : null}
    </>
  );
}
