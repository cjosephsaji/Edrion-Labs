import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { PETROS_ARTIFACT_FUNCTION_KEYS, PETROS_ARTIFACT_PROPOSAL_VERSION, PETROS_ARTIFACT_SCHEMA_VERSION } from '@edrion/schemas';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosArtifactsService } from './petros-artifacts.service';

const institutionId = '33333333-3333-4333-8333-333333333333';
const studentId = '22222222-2222-4222-8222-222222222222';
const sessionId = '11111111-1111-4111-8111-111111111111';
const bundleId = '44444444-4444-4444-8444-444444444444';
const proposalId = '55555555-5555-4555-8555-555555555555';
const secondProposalId = '66666666-6666-4666-8666-666666666666';
const artifactId = '77777777-7777-4777-8777-777777777777';
const productId = '88888888-8888-4888-8888-888888888888';
const now = new Date('2026-08-10T10:00:00.000Z');

const principal: InstitutionalStudentPrincipal = {
  kind: 'institutional', institutionId, campusId: null,
  institutionUserId: '99999999-9999-4999-8999-999999999999', studentId,
  email: 'learner@example.test', fullName: 'Learner', lastAuthAt: null,
  permissions: ['student.learn.use'],
};

describe('PetrosArtifactsService ownership boundary', () => {
  it('returns proposals separately while owned search remains empty before explicit save', async () => {
    const repo = repository();
    repo.findSession.mockResolvedValue(session());
    repo.findBundle.mockResolvedValue(bundle());
    repo.listProposals.mockResolvedValue([proposal()]);
    repo.listSaved.mockResolvedValue([]);
    const service = new PetrosArtifactsService(repo as never, learnerModels() as never);

    const proposed = await service.bundle(principal, sessionId);
    const owned = await service.list(principal, { limit: 50 });

    expect(proposed.counts).toEqual({ proposed: 1, saved: 0, failed: 0 });
    expect(proposed.proposals[0]?.savedArtifactId).toBeNull();
    expect(owned).toEqual([]);
  });

  it('saves an explicitly reviewed block note into the owned notes product', async () => {
    const repo = repository();
    repo.findSession.mockResolvedValue(session());
    repo.listSessionBlocks.mockResolvedValue([{ id: proposalId }]);
    repo.findNextExamDate.mockResolvedValue(null);
    repo.saveBlockArtifact.mockResolvedValue({
      state: 'saved',
      artifact: { ...savedArtifact(), kind: 'note', content: noteContent(), productType: 'note' },
    });
    const service = new PetrosArtifactsService(repo as never, learnerModels() as never);

    const result = await service.saveBlockArtifact(principal, sessionId, proposalId, {
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      content: noteContent(),
    });

    expect(result.content).toEqual(noteContent());
    expect(repo.saveBlockArtifact).toHaveBeenCalledWith(expect.objectContaining({
      sessionId,
      blockId: proposalId,
      content: noteContent(),
      firstReview: null,
      sources: [expect.objectContaining({ kind: 'session_block', sessionId, blockId: proposalId })],
    }));
    expect(repo.recordDoorArtifactSave).toHaveBeenCalledWith(
      expect.objectContaining({ institutionId, studentId }),
      sessionId,
      1,
    );
  });

  it('rejects executable markup without silently changing the student edit', async () => {
    const repo = repository();
    const service = new PetrosArtifactsService(repo as never, learnerModels() as never);
    await expect(service.updateProposal(principal, proposalId, {
      expectedVersion: 0,
      selected: true,
      content: { ...cardContent(), back: '<script>alert(1)</script>My words' },
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_ARTIFACT_UNSAFE_CONTENT' }) });
    expect(repo.updateProposal).not.toHaveBeenCalled();
  });

  it('requires an explicit editable-bundle selection before commit', async () => {
    const repo = repository();
    repo.findBundleById.mockResolvedValue(bundle());
    repo.beginCommit.mockResolvedValue({ state: 'started', command: { id: 'command-1' } });
    repo.findSession.mockResolvedValue(session());
    repo.listProposals.mockResolvedValue([proposal({ selected: false })]);
    const service = new PetrosArtifactsService(repo as never, learnerModels() as never);
    await expect(service.commit(principal, bundleId, {
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expectedBundleVersion: 0,
      proposalIds: [proposalId],
    })).rejects.toMatchObject({ response: expect.objectContaining({ code: 'PETROS_PROPOSAL_NOT_CURATED' }) });
    expect(repo.saveProposal).not.toHaveBeenCalled();
  });

  it('discards the proposal bundle without creating an owned product', async () => {
    const repo = repository();
    repo.discardBundle.mockResolvedValue(bundle({ state: 'discarded', version: 1, discardedAt: now }));
    repo.listProposals.mockResolvedValue([proposal({ state: 'discarded', discardedAt: now })]);
    const service = new PetrosArtifactsService(repo as never, learnerModels() as never);

    const result = await service.discard(principal, bundleId, 0);

    expect(result.state).toBe('discarded');
    expect(result.counts).toEqual({ proposed: 0, saved: 0, failed: 0 });
    expect(repo.saveProposal).not.toHaveBeenCalled();
  });

  it('returns an idempotent completed commit without another product write', async () => {
    const repo = repository();
    repo.findSession.mockResolvedValue(session());
    repo.findBundleById.mockResolvedValue(bundle());
    repo.beginCommit.mockResolvedValue({ state: 'completed', response: commitResponse() });
    const service = new PetrosArtifactsService(repo as never, learnerModels() as never);

    const result = await service.commit(principal, bundleId, {
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expectedBundleVersion: 0,
      proposalIds: [proposalId],
    });

    expect(result.results[0]).toMatchObject({ proposalId, status: 'saved', artifactId });
    expect(repo.saveProposal).not.toHaveBeenCalled();
  });

  it('revalidates source access before returning a completed save response',async()=>{
    const repo=repository();
    repo.findBundleById.mockResolvedValue(bundle());
    repo.findSession.mockRejectedValue(new Error('source revoked'));
    repo.beginCommit.mockResolvedValue({state:'completed',response:commitResponse()});
    const service=new PetrosArtifactsService(repo as never,learnerModels() as never);
    await expect(service.commit(principal,bundleId,{idempotencyKey:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expectedBundleVersion:0,proposalIds:[proposalId]})).rejects.toThrow('source revoked');
    expect(repo.beginCommit).not.toHaveBeenCalled();
  });

  it('preserves a successful item during partial failure and gives the failed item a retry path', async () => {
    const repo = repository();
    const proposals = [proposal({ selected: true, state: 'edited' }), proposal({ id: secondProposalId, selected: true, state: 'edited', kind: 'note', content: noteContent(), originalContent: noteContent() })];
    repo.findBundleById.mockResolvedValue(bundle());
    repo.beginCommit.mockResolvedValue({ state: 'started', command: { id: 'command-1' } });
    repo.findSession.mockResolvedValue(session());
    repo.listProposals.mockImplementation(async () => proposals);
    repo.findNextExamDate.mockResolvedValue('2026-08-20');
    repo.saveProposal
      .mockImplementationOnce(async () => {
        Object.assign(proposals[0]!, { state: 'saved', savedArtifactId: artifactId });
        return { state: 'saved', artifact: { id: artifactId } };
      })
      .mockRejectedValueOnce(new Error('fixture write failure'));
    repo.markProposalFailed.mockImplementation(async (_scope, id, code) => {
      Object.assign(proposals.find((item) => item.id === id)!, { state: 'failed', failureCode: code });
    });
    repo.refreshBundleState.mockResolvedValue(bundle({ state: 'partially_saved', version: 1 }));
    const service = new PetrosArtifactsService(repo as never, learnerModels() as never);

    const result = await service.commit(principal, bundleId, {
      idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expectedBundleVersion: 0,
      proposalIds: [proposalId, secondProposalId],
    });

    expect(result.results).toEqual([
      expect.objectContaining({ proposalId, status: 'saved', artifactId }),
      expect.objectContaining({ proposalId: secondProposalId, status: 'failed', recovery: expect.stringMatching(/edits/i) }),
    ]);
    expect(result.bundle.counts).toEqual({ proposed: 1, saved: 1, failed: 1 });
    expect(repo.finishCommit).toHaveBeenCalledTimes(1);
  });

  it('delivers one learner-evidence event for an idempotent review outcome', async () => {
    const repo = repository();
    const model = learnerModels();
    const artifact = savedArtifact();
    const outcome = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      learnerEvidenceEventId: null as string | null,
    };
    repo.findSaved.mockResolvedValue(artifact);
    repo.commitReview
      .mockResolvedValueOnce({ state: 'committed', outcome })
      .mockImplementationOnce(async () => ({ state: 'duplicate', outcome }));
    repo.attachReviewEvidence.mockImplementation(async (_scope, _id, eventId) => {
      outcome.learnerEvidenceEventId = eventId;
    });
    model.ingest.mockResolvedValue({ accepted: true, duplicate: false, evidenceEventId: 'evidence-1' });
    const service = new PetrosArtifactsService(repo as never, model as never);
    const input = {
      clientReviewId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      grade: 'good' as const,
      confidence: 'think_so' as const,
      reviewedAt: new Date(Date.now() - 1_000).toISOString(),
      elapsedMs: 2_000,
      timezone: 'Asia/Kolkata',
    };

    await service.review(principal, artifactId, input);
    await service.review(principal, artifactId, input);

    expect(model.ingest).toHaveBeenCalledTimes(1);
    expect(repo.attachReviewEvidence).toHaveBeenCalledWith(expect.anything(), outcome.id, 'evidence-1');
  });

  it('saves a student-edited structured diagram as a new accessible canvas revision', async () => {
    const repo = repository();
    const content = diagramContent();
    repo.updateSaved.mockResolvedValue({ ...savedArtifact(), kind: 'diagram', content, productType: 'canvas', revision: 2 });
    const service = new PetrosArtifactsService(repo as never, learnerModels() as never);

    const result = await service.updateSaved(principal, artifactId, { expectedRevision: 1, content });

    expect(repo.updateSaved).toHaveBeenCalledWith(expect.objectContaining({ institutionId, studentId }), artifactId, 1, content);
    expect(result.content).toEqual(content);
    expect(result.revision).toBe(2);
  });

  it('degrades a missing restricted source honestly and records content-free health evidence', async () => {
    const repo = repository();
    const restricted = { kind: 'document_page' as const, sessionId, blockId: null, knowledgeItemId: 'abababab-abab-4bab-8bab-abababababab', pageIndex: 2, assessmentId: null, label: 'Restricted reader', excerpt: 'must not leak', institutionRestricted: true };
    repo.findSaved.mockResolvedValue({ ...savedArtifact(), sources: [restricted] });
    repo.resolveKnowledgeSource.mockResolvedValue(undefined);
    const service = new PetrosArtifactsService(repo as never, learnerModels() as never);

    const result = await service.source(principal, artifactId, 0);

    expect(result).toMatchObject({ available: false, href: null, source: { excerpt: null } });
    expect(result.reason).toMatch(/removed, restricted, or is still unavailable/i);
    expect(repo.recordOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({ institutionId, studentId }), expect.objectContaining({ type: 'source.unavailable', artifactId }));
  });

  it('removes restricted provenance during an approved portable transfer', async () => {
    const repo = repository();
    repo.listSaved.mockResolvedValue([{ ...savedArtifact(), sources: [source(), { ...source(), institutionRestricted: true, label: 'Former institution reader', excerpt: 'restricted excerpt' }] }]);
    const service = new PetrosArtifactsService(repo as never, learnerModels() as never);

    const result = await service.export(principal, true);

    expect(result.portable).toBe(true);
    expect(result.artifacts[0]?.sources).toHaveLength(1);
    expect(result.artifacts[0]?.sources[0]?.institutionRestricted).toBe(false);
    expect(result.transferNotice).toMatch(/restricted sources and excerpts were removed/i);
  });
});

function repository() {
  return {
    findSession: vi.fn(), findBundle: vi.fn(), findBundleById: vi.fn(), listSessionBlocks: vi.fn(),
    createBundle: vi.fn(), listProposals: vi.fn(), updateProposal: vi.fn(), discardBundle: vi.fn(),
    beginCommit: vi.fn(), finishCommit: vi.fn(), failCommit: vi.fn(), saveProposal: vi.fn(), saveBlockArtifact: vi.fn(),
    markProposalFailed: vi.fn(), refreshBundleState: vi.fn(), findNextExamDate: vi.fn(),
    listSaved: vi.fn(), findSaved: vi.fn(), updateSaved: vi.fn(), deleteSaved: vi.fn(),
    listDue: vi.fn(), commitReview: vi.fn(), attachReviewEvidence: vi.fn(), findReviewByClient: vi.fn(),
    setLifecycle: vi.fn(), rebuildSchedulerVersion: vi.fn(), resolveKnowledgeSource: vi.fn(), resolveSessionBlock: vi.fn(),
    recordOperationalEvent: vi.fn(), recordFailureEvent: vi.fn(), recordDoorArtifactSave: vi.fn(),
  };
}

function learnerModels() {
  return { ingest: vi.fn() };
}

function session() {
  return {
    id: sessionId, institutionId, studentId, topic: 'photosynthesis',
    learnerContext: { timezone: 'Asia/Kolkata' }, sourceContext: null,
    createdAt: now, updatedAt: now,
  };
}

function bundle(patch: Record<string, unknown> = {}) {
  return {
    id: bundleId, institutionId, studentId, sessionId, state: 'open', version: 0,
    forwardLink: 'How does the stored energy get released?', expiresAt: null, discardedAt: null,
    createdAt: now, updatedAt: now, ...patch,
  };
}

function proposal(patch: Record<string, unknown> = {}) {
  return {
    id: proposalId, bundleId, institutionId, studentId, kind: 'flashcard', state: 'proposed', selected: false,
    originalContent: cardContent(), content: cardContent(), sources: [source()],
    generationFunctionKey: PETROS_ARTIFACT_FUNCTION_KEYS.flashcard, promptVersion: 'v1', schemaVersion: PETROS_ARTIFACT_PROPOSAL_VERSION,
    version: 0, savedArtifactId: null, failureCode: null, editedAt: null, savedAt: null, discardedAt: null,
    createdAt: now, updatedAt: now, ...patch,
  };
}

function cardContent() {
  return { kind: 'flashcard' as const, title: 'Energy change', front: 'What changes?', back: 'Light becomes stored chemical energy.', hint: null, explanation: null, tags: ['photosynthesis'] };
}

function noteContent() {
  return { kind: 'note' as const, title: 'Energy note', body: 'Light becomes stored chemical energy.', tags: ['photosynthesis'] };
}

function diagramContent() {
  return {
    kind: 'diagram' as const,
    title: 'Photosynthesis energy flow',
    archetype: 'flowchart' as const,
    nodes: [
      { id: 'light', label: 'Light energy', description: 'Energy entering the system.' },
      { id: 'glucose', label: 'Glucose stores chemical energy', description: 'The learner-edited destination.' },
    ],
    edges: [{ id: 'edge_1', from: 'light', to: 'glucose', label: 'becomes stored as' }],
    accessibleDescription: 'Light energy becomes stored chemical energy in glucose.',
    tags: ['photosynthesis'],
  };
}

function commitResponse() {
  return {
    bundle: {
      schemaVersion: PETROS_ARTIFACT_SCHEMA_VERSION,
      id: bundleId,
      sessionId,
      state: 'saved',
      version: 1,
      proposals: [],
      counts: { proposed: 0, saved: 1, failed: 0 },
      forwardLink: 'How does the stored energy get released?',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    results: [{ proposalId, status: 'saved', artifactId, errorCode: null, recovery: null }],
  };
}

function source() {
  return { kind: 'session_block' as const, sessionId, blockId: proposalId, knowledgeItemId: null, pageIndex: null, assessmentId: null, label: 'Session block', excerpt: null, institutionRestricted: false };
}

function savedArtifact() {
  return {
    id: artifactId, portableId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', institutionId, studentId,
    sessionId, bundleId, sourceProposalId: proposalId, kind: 'flashcard', lifecycle: 'saved',
    content: cardContent(), sources: [source()], productType: 'flashcard', productTargetId: productId,
    contentVersion: 'student-curated.v1', promptVersion: 'v1', schemaVersion: PETROS_ARTIFACT_SCHEMA_VERSION,
    revision: 1, dueAt: new Date('2026-08-10T09:00:00.000Z'), intervalMinutes: 1_440,
    easeBasisPoints: 25_000, reviewReps: 0, reviewLapses: 0, schedulerVersion: 'petros.review.exam-aware.v1',
    examDate: '2026-08-20', examAware: false, pausedAt: null, archivedAt: null, deletedAt: null,
    createdAt: now, updatedAt: now,
  };
}
