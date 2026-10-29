import { learningUIFor, type M4Snapshot } from '@edrion/schemas';

/** The same closed content composer drives server snapshots and compatible
 * historical sessions. Diagnostic hypotheses never become learner copy. */
export function teachingPresentation(snapshot: M4Snapshot) {
  return learningUIFor(snapshot);
}
