export const RESULTS_RELEASE_FANOUT_JOB = 'results.release_fanout';
export const RESULTS_RECOMPUTE_TERM_JOB = 'results.recompute_term';

export interface ResultsReleaseFanoutJobData {
  institutionId: string;
  batchId: string;
  batchVersion: number;
  studentIds: string[];
  subjectName: string;
  assessmentLabel: string;
  termId: string;
  subjectId: string;
  highlightRef: string;
}

export interface ResultsRecomputeTermJobData {
  institutionId: string;
  studentId: string;
  termId: string;
  emitFeed?: boolean;
  batchId?: string;
  revisionId?: string;
}
