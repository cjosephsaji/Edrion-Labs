import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  evaluatePetrosProjectile,
  petrosProjectileSnapshotSchema,
  updatePetrosProjectileParameter,
  type PetrosProjectileCommand,
} from '@edrion/schemas';
import {
  PETROS_PROJECTILE_ASSUMPTIONS,
  PETROS_PROJECTILE_CAPABILITY,
} from '../../../../../packages/schemas/src/petros-projectile-model';
import {
  projectileBinding,
  projectileIds,
  projectileSourceVersion,
} from '../../../../../packages/schemas/src/__fixtures__/petros-phase2-projectile';
import { StudentApiClient } from '@/lib/api-client';
import { PetrosProjectileExplorer } from './petros-projectile-explorer';

const api = new StudentApiClient('http://synthetic.test');
vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<typeof import('@/lib/api-client')>()),
  useStudentApi: () => api,
}));
afterEach(() => vi.unstubAllGlobals());

function initialSnapshot() {
  const state = evaluatePetrosProjectile({
    schemaVersion: 'petros.projectile-input.v1',
    capability: PETROS_PROJECTILE_CAPABILITY,
    assumptions: PETROS_PROJECTILE_ASSUMPTIONS,
    launchVelocity: { x: 12, y: 18, unit: 'm/s' },
    gravity: { value: 9.8, unit: 'm/s^2' },
    elapsedTime: { value: 0, unit: 's' },
  });
  return petrosProjectileSnapshotSchema.parse({
    schemaVersion: 'petros.projectile-snapshot.v1',
    version: 0,
    binding: projectileBinding,
    state,
    policy: {
      schemaVersion: 'petros.knowledge-policy.v1',
      mode: 'source_bound',
      requestedMode: null,
      policyVersionIds: [],
      authorityHash: 'c'.repeat(64),
      sourceId: projectileIds.object,
      sourceFingerprint: projectileSourceVersion,
      pages: [2],
      subjectId: null,
      maximumDepth: 0,
      assignmentRestrictions: [],
      retrieval: { designatedSource: true, external: false },
      authority: 'designated_material_with_institution_restrictions',
      explanation: 'The document is the designated source.',
    },
    operationId: '66666666-6666-4666-8666-666666666666',
    commandHash: 'd'.repeat(64),
  });
}

const reviewedDefaultInput = {
  schemaVersion: 'petros.projectile-input.v1' as const,
  capability: PETROS_PROJECTILE_CAPABILITY,
  assumptions: PETROS_PROJECTILE_ASSUMPTIONS,
  launchVelocity: { x: 10, y: 10, unit: 'm/s' as const },
  gravity: { value: 9.81, unit: 'm/s^2' as const },
  elapsedTime: { value: 0, unit: 's' as const },
};

function transport(options: { disabled?: boolean; unavailable?: boolean; ready?: boolean } = {}) {
  let snapshot = initialSnapshot();
  let ready = options.ready ?? false;
  const commands: PetrosProjectileCommand[] = [];
  let loseReply = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (options.disabled) return new Response(JSON.stringify({ status: 'disabled' }), { status: 200 });
      if (options.unavailable) {
        return new Response(
          JSON.stringify({
            status: 'unavailable',
            recovery: 'original_source',
            reason: 'The bound source is no longer current. The original diagram remains available.',
          }),
          { status: 200 },
        );
      }
      if (init?.method !== 'PUT' && ready) {
        return new Response(
          JSON.stringify({ status: 'ready', binding: projectileBinding, defaultInput: reviewedDefaultInput }),
          { status: 200 },
        );
      }
      if (init?.method === 'PUT') {
        const command = JSON.parse(String(init.body)) as PetrosProjectileCommand;
        commands.push(command);
        if (snapshot.operationId !== command.operationId) {
          const state = command.action.kind === 'initialise'
            ? evaluatePetrosProjectile(command.action.input)
            : updatePetrosProjectileParameter(snapshot.state, command.action.change);
          snapshot = petrosProjectileSnapshotSchema.parse({
            ...snapshot,
            version: command.expectedVersion + 1,
            state,
            operationId: command.operationId,
            commandHash: 'e'.repeat(64),
          });
          ready = false;
        }
        if (loseReply) {
          loseReply = false;
          throw new Error('Lost response after commit');
        }
      }
      return new Response(JSON.stringify({ status: 'available', snapshot, replayed: false }), { status: 200 });
    }),
  );
  return {
    commands,
    loseNextReply() {
      loseReply = true;
    },
  };
}

function open() {
  return render(
    <PetrosProjectileExplorer
      sessionId="77777777-7777-4777-8777-777777777777"
      blockId={projectileIds.diagram}
    />,
  );
}

describe('Petros projectile production consumer', () => {
  it('creates no learner-facing UI while the rollout endpoint is disabled', async () => {
    transport({ disabled: true });
    open();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByLabelText('Projectile simulation')).toBeNull();
  });

  it('uses original-diagram recovery when the authorized source or binding is stale', async () => {
    transport({ unavailable: true });
    open();
    await screen.findByText(/bound source is no longer current/i);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByRole('button', { name: 'Check simulation' })).toBeVisible();
  });

  it('starts only from the server-provided reviewed binding and retries an exact initialize command', async () => {
    const server = transport({ ready: true });
    open();
    await screen.findByRole('button', { name: 'Start simulation' });
    server.loseNextReply();
    fireEvent.click(screen.getByRole('button', { name: 'Start simulation' }));
    await screen.findByRole('button', { name: 'Retry start' });
    expect(server.commands).toHaveLength(1);
    expect(server.commands[0]).toMatchObject({
      expectedVersion: 0,
      binding: projectileBinding,
      action: { kind: 'initialise', input: reviewedDefaultInput },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry start' }));
    await screen.findByText('Saved simulation version 1');
    expect(server.commands[1]).toEqual(server.commands[0]);
  });

  it('retries the exact pending command after a lost reply and displays the committed checkpoint', async () => {
    const server = transport();
    open();
    const summary = await screen.findByText('Explore the reviewed projectile model');
    fireEvent.click(summary);
    server.loseNextReply();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Horizontal launch velocity (m/s)' }), {
      target: { value: '20' },
    });
    await screen.findByRole('button', { name: 'Retry change' });
    expect(screen.getByText('Saved simulation version 0')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry change' }));
    await screen.findByText('Saved simulation version 1');
    expect(server.commands).toHaveLength(2);
    expect(server.commands[1]).toEqual(server.commands[0]);
  });
});
