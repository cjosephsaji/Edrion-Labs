'use client';
import {
  m3ActivityPreview,
  type ContentUnit,
  type M3Proposal,
} from '@edrion/schemas';
import { useState } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';
import styles from './petros-learn.module.css';

export const activityNames: Record<string, string> = {
  source_reading: 'Read and explain',
  comparison: 'Compare examples',
  relationship_board: 'Connect ideas',
  progressive_explanation: 'Explore an explanation',
  equation_demonstration: 'Follow an equation',
  diagram_construction: 'Explore a diagram',
  table_exploration: 'Explore a table',
  prediction_change_explain: 'Predict and explain',
  faded_practice: 'Practise a worked example',
  process_animation: 'Explore a process',
  safe_code_trace: 'Follow a code example',
  student_editing: 'Complete an explanation',
  trusted_simulation: 'Explore a simulation',
  targeted_question: 'Answer a question',
};
/** Titles and instructions use the proposal's public purpose; no topic dispatch or inferred answers. */
export function activityTitle(activity: M3Proposal['activities'][number]) {
  return activity.purpose.includes('\n')
    ? activity.purpose.split('\n')[0]!
    : (activityNames[activity.family] ?? 'Lesson activity');
}
function ClassificationPreview({
  table,
}: {
  table: Extract<ContentUnit['payload'], { kind: 'table' }>;
}) {
  const [index, setIndex] = useState(0);
  const headers = table.columns.map(
    (column) =>
      table.cells.find((c) => c.row === table.rows[0] && c.column === column)!,
  );
  const rows = table.rows.slice(1);
  const row = rows[Math.min(index, rows.length - 1)]!;
  const cells = table.columns.map(
    (column) => table.cells.find((c) => c.row === row && c.column === column)!,
  );
  return (
    <div className={styles.classification}>
      <div
        role="group"
        aria-label="Preview a source table row"
        className={styles.modelChoices}
      >
        {rows.map((r, i) => (
          <button key={r} aria-pressed={r === row} onClick={() => setIndex(i)}>
            {
              table.cells.find(
                (c) => c.row === r && c.column === table.columns[0],
              )!.value
            }
          </button>
        ))}
      </div>
      <p className={styles.muted}>
        Source cards for <strong>{cells[0]!.value}</strong> · shown before
        sorting
      </p>
      <ul className={styles.sourceCards} aria-label="Source cards to classify">
        {cells
          .slice(1)
          .reverse()
          .map((c) => (
            <li key={c.id}>{c.value}</li>
          ))}
      </ul>
      <div
        className={styles.conceptGrid}
        aria-label="Classification categories"
      >
        {headers.slice(1).map((c) => (
          <section className={styles.conceptNode} key={c.id}>
            <h5>{c.value}</h5>
            <p className={styles.responseSlot}>
              Place the matching source card here
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
export function ActivityPresentation({
  proposal,
  activityId,
  sourcePayload,
  sourceUnitId,
}: {
  proposal: M3Proposal;
  activityId: string;
  sourcePayload?: ContentUnit['payload'];
  sourceUnitId?: string;
}) {
  const activity = proposal.activities.find((a) => a.id === activityId);
  const objective = proposal.objectives.find(
    (o) => o.id === activity?.objectiveId,
  );
  if (!activity || !objective || activity.reviewStatus === 'rejected')
    return <p>Choose a supported activity to see its preview.</p>;
  let block;
  try {
    block = m3ActivityPreview(proposal, activityId);
  } catch {
    block = null;
  }
  const content = block?.content;
  const support = activity.support.filter((s) =>
    objective.support.some((o) => o.reference.unitId === s.reference.unitId),
  );
  const table =
    sourcePayload?.kind === 'table' &&
    support.some((s) => s.reference.unitId === sourceUnitId)
      ? sourcePayload
      : null;
  // Only a fully resolved rectangular source table can supply classification categories/cards.
  const classify =
    activity.family === 'table_exploration' &&
    /\b(classif\w*|match|sort)\b/i.test(objective.wording) &&
    table &&
    table.rows.length > 1 &&
    table.columns.length >= 2 &&
    table.columns.length <= 4 &&
    table.cells.length === table.rows.length * table.columns.length &&
    table.cells.every(
      (c) =>
        !c.unresolved &&
        c.rowSpan === 1 &&
        c.columnSpan === 1 &&
        c.header === (c.row === table.rows[0]),
    );
  const instruction = activity.purpose.includes('\n')
    ? activity.purpose.split('\n').slice(1).join('\n')
    : activity.purpose;
  const quotes = [...new Set(support.map((s) => s.quote))];
  return (
    <section
      aria-label="Read-only activity preview"
      className={styles.activityCanvas}
    >
      <div className={styles.canvasLabel}>
        <BookOpen size={16} aria-hidden="true" /> Proposed student task
      </div>
      <div className={styles.previewTitle}>
        <h4>{activityTitle(activity)}</h4>
        <span className={styles.status}>Read only</span>
      </div>
      <p className={styles.previewHint}>
        Answer areas are examples. Responses cannot be entered or submitted in
        this preview.
      </p>
      <p className={styles.activityPrompt}>{instruction}</p>
      {support.length !== activity.support.length && (
        <p className={styles.previewNote}>
          This activity also cites material outside this objective’s source
          references. Only the shared source is shown. Check the activity fit
          with your reviewer.
        </p>
      )}
      {!block ? (
        <p className={styles.notice}>
          Only a structural description is available. This activity cannot run
          here; choose a supported alternative. No task execution or answers are
          shown.
        </p>
      ) : classify ? (
        <ClassificationPreview key={activity.id} table={table} />
      ) : (
        <>
          {table && activity.family === 'table_exploration' ? (
            <NativeSourceTable table={table} />
          ) : (
            <div
              className={
                quotes.length > 1 ? styles.evidenceGrid : styles.readingPreview
              }
            >
              {quotes.map((quote, i) => (
                <section key={i}>
                  <p className={styles.eyebrow}>
                    {quotes.length > 1
                      ? `Source passage ${i + 1}`
                      : 'Source example'}
                  </p>
                  <blockquote>{quote}</blockquote>
                </section>
              ))}
            </div>
          )}
          {content?.type === 'diagram' && (
            <div className={styles.conceptGrid}>
              {content.nodes.map((node) => (
                <section key={node.id} className={styles.conceptNode}>
                  <h5>{node.label}</h5>
                  <p className={styles.responseSlot}>
                    Identify and explain using the source
                  </p>
                </section>
              ))}
            </div>
          )}
          {content?.type === 'diagram' && content.edges.length > 0 && (
            <details className={styles.connections}>
              <summary>Unreviewed connection proposals</summary>
              <p>
                These are candidate connections, not established causes or
                prerequisites.
              </p>
              {content.edges.map((edge, i) => (
                <p key={i}>
                  {content.nodes.find((n) => n.id === edge.from)?.label}
                  <ArrowRight size={16} aria-hidden="true" />
                  {content.nodes.find((n) => n.id === edge.to)?.label} ·{' '}
                  {edge.label}
                </p>
              ))}
            </details>
          )}
          <div
            className={styles.responseSlot}
            aria-label="Planned response area"
          >
            <strong>
              {activity.family === 'comparison'
                ? 'Your comparison and source example'
                : activity.family === 'targeted_question'
                  ? 'Your answer and source evidence'
                  : 'Your source-based explanation'}
            </strong>
            <p>
              The learner would explain here. No response is collected in this
              preview.
            </p>
          </div>
        </>
      )}
      <div className={styles.expectedResponse}>
        <h5>What the student would produce</h5>
        <p>{activity.expectedObservation}</p>
      </div>
      <p className={styles.previewNote}>
        Read-only task layout · subject review required. No student work,
        assessment result or approved conceptual relationship is shown.
      </p>
    </section>
  );
}

export function sourceLocation(locator: unknown): string {
  if (!locator || typeof locator !== 'object') return 'Document section';
  const l = locator as Record<string, unknown>;
  if (l.kind === 'pdf')
    return `Page ${l.page}${l.region ? ' · selected passage' : ''}`;
  if (l.kind === 'slide')
    return `Slide ${l.slide}${l.notes ? ' · speaker notes' : ' · selected content'}`;
  if (l.kind === 'docx')
    return `Word document · section ${Number(l.section ?? 0) + 1}${l.paragraphOrdinal !== undefined ? ` · paragraph ${Number(l.paragraphOrdinal) + 1}` : ''}${l.tableId ? ` · table${l.row !== undefined ? `, row ${Number(l.row) + 1}` : ''}` : ''}`;
  if (l.kind === 'txt' || l.kind === 'markdown') {
    const start = l.start as { line?: number } | undefined,
      end = l.end as { line?: number } | undefined;
    return `${l.kind === 'txt' ? 'Text' : 'Markdown'} document · ${start?.line ? `lines ${start.line}–${end?.line ?? start.line}` : 'selected section'}`;
  }
  if (l.kind === 'converted_slide')
    return `Slide ${l.originalSlide} · converted page ${l.convertedPage}`;
  return 'Selected document section';
}

const blockerText: Record<string, string> = {
  TEACHING_SCOPE_REVIEW_REQUIRED:
    'A qualified reviewer needs to approve the teaching material.',
  CONCEPTS_REVIEW_REQUIRED: 'The lesson concepts need a qualified review.',
  ACTIVITIES_REVIEW_REQUIRED: 'The activities need a qualified review.',
  QUALIFIED_INSTRUMENT_REQUIRED:
    'Assessment questions need a separate qualified review.',
  SEMANTIC_REVIEW_REQUIRED:
    'The meaning and accuracy of the source content need review.',
  SOURCE_COVERAGE_INCOMPLETE:
    'Some parts of the document could not be read. Check the source details.',
  SOURCE_QUALITY_UNRESOLVED: 'Unclear source sections need review.',
  CANONICAL_COURSE_REQUIRED:
    'An academic administrator needs to connect this lesson to its course.',
  M4_ADMISSION_NOT_IMPLEMENTED:
    'Student use is not available in this development build.',
};
export function reviewRequirement(code: string): string {
  if (blockerText[code]) return blockerText[code];
  if (/COVERAGE|OMITTED|UNRESOLVED/.test(code))
    return 'Some source sections need to be checked before approval.';
  if (/INSTRUMENT|ASSESSMENT|VERIFICATION/.test(code))
    return 'Assessment questions need a separate qualified review.';
  if (/CONCEPT/.test(code))
    return 'The lesson concepts need a qualified review.';
  if (/ACTIVIT|CAPABILITY/.test(code))
    return 'Select and review a supported activity for each objective.';
  if (/CURRICULUM|COURSE|MAPPING|ROSTER|RECIPIENT/.test(code))
    return 'An academic administrator needs to check the course and class details.';
  if (/SOURCE/.test(code))
    return 'The teaching material needs to be checked for accuracy and access.';
  if (/M4|PUBLICATION|STUDENT/.test(code))
    return 'Student use is not available in this development build.';
  if (/TEACHING|REVIEW|APPROVAL|QUALIF/.test(code))
    return 'Current approval from a qualified reviewer is needed.';
  return 'An academic administrator needs to resolve an outstanding approval requirement.';
}
export function reviewStatus(status?: string) {
  return (
    (
      {
        approved: 'Approved for this revision',
        revision_requested: 'Changes requested',
        rejected: 'Changes requested',
        stale: 'Review needed again',
        pending: 'Waiting for review',
      } as Record<string, string>
    )[status ?? ''] ?? 'Review needed'
  );
}

export function NativeSourceTable({
  table,
}: {
  table: Extract<ContentUnit['payload'], { kind: 'table' }>;
}) {
  const header = (column: string) =>
    table.cells.find(
      (cell) =>
        cell.row === table.rows[0] && cell.column === column && cell.header,
    )?.value ?? `Column ${table.columns.indexOf(column) + 1}`;
  const rowCards = (
    <div
      className={styles.tableCards}
      role="group"
      aria-label="Source table rows"
    >
      <p className={styles.muted}>
        {table.caption ?? 'From the selected teaching material'}
      </p>
      {table.rows.map((row, index) => {
        const cells = table.cells
          .filter((cell) => {
            const start = table.rows.indexOf(cell.row);
            return start <= index && start + cell.rowSpan > index;
          })
          .sort(
            (a, b) =>
              table.columns.indexOf(a.column) - table.columns.indexOf(b.column),
          );
        if (!cells.length || cells.every((cell) => cell.header)) return null;
        const first = cells[0]!;
        return (
          <section key={row} className={styles.tableRow}>
            <h5>
              {header(first.column)}: {first.value}
              {first.unit ? ` (${first.unit})` : ''}
              {first.unresolved ? ' · needs source review' : ''}
            </h5>
            <dl>
              {cells.slice(1).map((cell) => (
                <div key={cell.id}>
                  <dt>
                    {table.columns
                      .slice(
                        table.columns.indexOf(cell.column),
                        table.columns.indexOf(cell.column) + cell.columnSpan,
                      )
                      .map(header)
                      .join(' / ')}
                  </dt>
                  <dd>
                    {cell.value}
                    {cell.unit ? ` (${cell.unit})` : ''}
                    {cell.unresolved ? ' · needs source review' : ''}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
  return (
    <div
      className={`${styles.nativeTable} ${table.columns.length > 4 ? styles.stackedTable : ''}`}
    >
      <div className={styles.tableView}>
        <table>
          <caption>
            {table.caption ?? 'From the selected teaching material'}
          </caption>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row}>
                {table.cells
                  .filter((cell) => cell.row === row)
                  .map((cell) =>
                    cell.header ? (
                      <th
                        key={cell.id}
                        scope="col"
                        rowSpan={cell.rowSpan}
                        colSpan={cell.columnSpan}
                      >
                        {cell.value}
                      </th>
                    ) : (
                      <td
                        key={cell.id}
                        rowSpan={cell.rowSpan}
                        colSpan={cell.columnSpan}
                      >
                        {cell.value}
                        {cell.unit ? ` (${cell.unit})` : ''}
                        {cell.unresolved ? ' · needs source review' : ''}
                      </td>
                    ),
                  )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rowCards}
    </div>
  );
}
