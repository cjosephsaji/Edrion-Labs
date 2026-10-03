'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  petrosQuestionExecutionSchema,
  type PetrosQuestionExecution,
  type PetrosComposerQuestionInput,
  type PetrosLearningSessionDocument,
} from '@edrion/schemas';
import { StudentApiError, type StudentApiClient } from '../../lib/api-client';

const knowledgeHeaders = { 'x-petros-knowledge-policy': 'petros.knowledge-policy.v1' };

/** Server commands own recovery; only the pending request key lives in this tab's storage. */
export function useDocumentQuestion(
  api: StudentApiClient,
  sessionId: string | null,
  onResult: (result: PetrosLearningSessionDocument) => void,
) {
  const [execution, setExecution] = useState<PetrosQuestionExecution | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const statusRef = useRef<HTMLElement | null>(null);
  const commandFocus = useRef(false);
  const submitting = useRef(false);
  const accepted = useRef<PetrosQuestionExecution | null>(null);
  const generation = useRef(0);
  const waiter = useRef<{
    resolve: (value: PetrosLearningSessionDocument) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const retryInput = useRef<PetrosComposerQuestionInput | null>(null);
  const resultHandler = useRef(onResult);
  resultHandler.current = onResult;
  const currentSession = useRef(sessionId);
  currentSession.current = sessionId;
  const base = sessionId ? `/student/petros/sessions/${sessionId}/document-questions` : null;
  const key = `petros-document-question:${sessionId}`;
  const remember = useCallback(
    (value: string | null) => {
      try {
        if (value) sessionStorage.setItem(key, value);
        else sessionStorage.removeItem(key);
      } catch {
        /* Server status remains authoritative. */
      }
    },
    [key],
  );

  const accept = useCallback(
    (raw: unknown) => {
      const value = petrosQuestionExecutionSchema.parse(raw);
      if (
        value.sessionId !== currentSession.current ||
        (retryInput.current && retryInput.current.idempotencyKey !== value.idempotencyKey)
      )
        return;
      if (accepted.current?.id === value.id && value.version < accepted.current.version) return;
      // Current-policy denial wins over an older in-flight successful read at the same receipt revision.
      if (accepted.current?.id === value.id && accepted.current.version === value.version &&
        accepted.current.errorCode === 'PETROS_KNOWLEDGE_POLICY_CHANGED' && value.state === 'succeeded') return;
      accepted.current = value;
      setExecution(value);
      setError('');
      if (value.state === 'succeeded' && value.result) {
        resultHandler.current(value.result);
        remember(null);
        retryInput.current = null;
        waiter.current?.resolve(value.result);
        waiter.current = null;
      } else if (value.state === 'failed' || value.state === 'cancelled') {
        remember(null);
        retryInput.current = null;
        waiter.current?.reject(
          new Error(
            value.state === 'cancelled'
              ? 'Question cancelled.'
              : value.admission?.message ?? (value.errorCode === 'PETROS_QUESTION_BUDGET_LIMIT'
                ? 'The AI usage limit prevented another attempt. Your lesson remains available.'
              : 'The answer did not finish. Check the question status to retry.'),
          ),
        );
        waiter.current = null;
      } else remember(value.idempotencyKey);
    },
    [remember],
  );

  const refresh = useCallback(async () => {
    if (!base) return;
    const epoch = generation.current;
    try {
      let pendingKey: string | null = null;
      try {
        pendingKey = sessionStorage.getItem(key);
      } catch {
        /* Storage is optional. */
      }
      let value: unknown;
      try {
        value = await api.get<unknown>(pendingKey ? `${base}/${pendingKey}` : base, undefined, knowledgeHeaders);
      } catch (caught) {
        if (!pendingKey || !(caught instanceof StudentApiError) || caught.status !== 404)
          throw caught;
        value = await api.get<unknown>(base, undefined, knowledgeHeaders);
      }
      if (value && epoch === generation.current) accept(value);
    } catch (caught) {
      if (epoch !== generation.current) return;
      if (
        caught instanceof StudentApiError &&
        [401, 403, 404].includes(caught.status) &&
        accepted.current
      ) {
        setExecution(null);
        accepted.current = null;
        remember(null);
        retryInput.current = null;
        waiter.current?.reject(
          new Error('Question access changed. Reopen the lesson after signing in.'),
        );
        waiter.current = null;
        setError('Question access changed. Reopen the lesson after signing in.');
        return;
      }
      if (caught instanceof StudentApiError && caught.status === 404) return; // Reader-first rollout; older API has no status route.
      setError('Could not refresh the question. Reconnect and refresh its status.');
    }
  }, [api, base, key, accept, remember]);

  useEffect(() => {
    generation.current++;
    accepted.current = null;
    setExecution(null);
    setError('');
    retryInput.current = null;
    if (!base) return;
    void refresh();
    return () => {
      waiter.current?.reject(
        new Error('Question continues in the background. Reopen this lesson to check it.'),
      );
      waiter.current = null;
    };
  }, [base, refresh]);

  useEffect(() => {
    if (!base || !execution || !['queued', 'running'].includes(execution.state)) return;
    const timer = setInterval(() => {
      if (navigator.onLine) void refresh();
    }, 1500);
    return () => clearInterval(timer);
  }, [base, execution, refresh]);

  const ask = useCallback(
    async (input: PetrosComposerQuestionInput): Promise<PetrosLearningSessionDocument | null> => {
      if (!base) return null;
      if (
        submitting.current ||
        waiter.current ||
        (execution && ['queued', 'running'].includes(execution.state))
      )
        throw new Error('Check your pending question before asking another.');
      // A transport retry reuses the exact input and key. A changed question must first reconcile the earlier request.
      if (
        retryInput.current &&
        JSON.stringify({ ...retryInput.current, idempotencyKey: '' }) !==
          JSON.stringify({ ...input, idempotencyKey: '' })
      )
        throw new Error(
          'Refresh the previous question status before sending a different question.',
        );
      generation.current++;
      const request = retryInput.current ?? input;
      retryInput.current = request;
      remember(request.idempotencyKey);
      let raw: unknown;
      submitting.current = true;
      try {
        raw = await api.post(base, request, knowledgeHeaders);
      } catch (caught) {
        if (
          caught instanceof StudentApiError &&
          (caught.code === 'PETROS_QUESTION_EXECUTION_DISABLED' || caught.status === 404)
        ) {
          retryInput.current = null;
          remember(null);
          return null;
        }
        if (caught instanceof StudentApiError && caught.status >= 400 && caught.status < 500) {
          retryInput.current = null;
          remember(null);
        }
        void refresh();
        throw caught;
      } finally {
        submitting.current = false;
      }
      return new Promise((resolve, reject) => {
        waiter.current = { resolve, reject };
        accept(raw);
      });
    },
    [api, base, execution, remember, refresh, accept],
  );

  const command = useCallback(
    async (action: 'cancel' | 'retry') => {
      if (!base || !execution || busy) return;
      generation.current++;
      commandFocus.current = true;
      setBusy(true);
      try {
        accept(
          await api.post(`${base}/${execution.idempotencyKey}/commands`, {
            version: execution.version,
            action,
          }, knowledgeHeaders),
        );
      } catch {
        setError('The command result is uncertain. Refresh status before trying again.');
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [api, base, execution, busy, accept, refresh],
  );

  useEffect(() => {
    if (!busy && commandFocus.current) {
      statusRef.current?.focus();
      commandFocus.current = false;
    }
  }, [busy, execution?.state]);

  const status = execution ? (
    <section ref={statusRef} tabIndex={-1} aria-label="Document question status" aria-live="polite">
      <p>
        {execution.state === 'queued'
          ? 'Your question is queued.'
          : execution.state === 'running'
            ? 'Preparing your answer from the selected source pages.'
            : execution.state === 'succeeded'
              ? 'Your answer is ready in the lesson.'
              : execution.state === 'cancelled'
                ? 'Question cancelled.'
                : execution.admission?.message ?? (execution.errorCode === 'PETROS_QUESTION_BUDGET_LIMIT'
                  ? 'The AI usage limit prevented another attempt. Your lesson remains available.'
                : 'The answer did not finish. Your lesson is still available.')}
      </p>
      {execution.knowledgePolicy && <p>{execution.knowledgePolicy.explanation}</p>}
      {execution.admission && <p>Limit category: {execution.admission.category.replaceAll('_', ' ')}. Reference: {execution.admission.correlationId}</p>}
      {!execution.processingEnabled && (
        <p>Question processing is currently disabled. You can cancel queued work.</p>
      )}
      {['queued', 'running'].includes(execution.state) && (
        <button type="button" disabled={busy} onClick={() => void command('cancel')}>
          Cancel question
        </button>
      )}
      {execution.retryable && execution.processingEnabled && (
        <button type="button" disabled={busy} onClick={() => void command('retry')}>
          Retry question
        </button>
      )}
      <button type="button" disabled={busy} onClick={() => void refresh()}>
        Refresh question status
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  ) : error ? (
    <p role="alert">
      {error}{' '}
      <button type="button" onClick={() => void refresh()}>
        Refresh question status
      </button>
    </p>
  ) : null;
  return { ask, status };
}
