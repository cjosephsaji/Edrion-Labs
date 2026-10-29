import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { API_ENV } from '../../../common/tokens';
import { StudentAuthService } from '../auth/student-auth.service';
import { StudentSessionService } from '../core/student-session.service';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { PetrosVoicePreviewController } from './petros-voice-preview.controller';
import { PetrosVoicePreviewService } from './petros-voice-preview.service';

/** Actual controller and guard chain; session/routing/database dependencies are in-memory.
 * Never boots AppModule/main.ts, loads dotenv, opens a database connection or dispatches a provider. */
describe('isolated authenticated preview HTTP', () => {
  let app: INestApplication;
  const studentId = '00000000-0000-4000-8000-000000000001', routeId = '00000000-0000-4000-8000-000000000002';
  const principal = { kind: 'institutional', studentId, institutionId: routeId, permissions: ['student.learn.use'] };
  const env = { NODE_ENV: 'test', STUDENT_AUTH_DEV_HEADER: false, RATE_LIMIT_ENABLED: true,
    PETROS_V2_COMPANION_PLAYGROUND_ENABLED: true, PETROS_V2_COMPANION_PLAYGROUND_TESTER_IDS: studentId,
    PETROS_V2_VOICE_PREVIEW_ENABLED: true, PETROS_V2_VOICE_PREVIEW_ISOLATED_APPROVED: true, PETROS_V2_VOICE_PREVIEW_PAID_APPROVED: true,
    PETROS_V2_VOICE_PREVIEW_APPROVAL_ID: 'http-contract-only', PETROS_V2_VOICE_PREVIEW_APPROVAL_EXPIRES_AT: new Date(Date.now() + 3600000).toISOString(),
    PETROS_V2_VOICE_PREVIEW_MAX_TOTAL_COST_MICROS: 20000, PETROS_V2_VOICE_PREVIEW_MAX_CALL_COST_MICROS: 10000,
    PETROS_AI_MODE: 'live', REDIS_ENABLED: true };
  const db = { transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ execute: async () => [] }) };
  const gateway = { execute: vi.fn(async () => { throw new Error('Provider dispatch forbidden in HTTP status QA'); }) };
  const routing = { previewRoute: vi.fn(async () => ({ selected: { routeId, providerId: routeId, modelId: routeId } })) };
  const repo = { findProvider: async () => ({ key: 'synthetic', adapterType: 'openai', enabled: true, credentialEnvelope: 'synthetic-not-secret' }),
    findModel: async () => ({ enabled: true, modelKey: 'tts-1', providerOptions: { pricingUnit: 'character', priceMicrosPerMillionCharacters: 15000000 } }) };
  const redis = { enabled: true, incrementWindow: async () => 1, acquireStudentQuota: vi.fn(async () => ({ allowed: false })) };
  const sessions = { cookieName: 'isolated', verify: async (token: string) => { if (token !== 'allowed') throw new UnauthorizedException(); return { sessionId: 'synthetic' }; } };
  beforeAll(async () => {
    Reflect.defineMetadata('design:paramtypes', [PetrosVoicePreviewService], PetrosVoicePreviewController);
    const service = new PetrosVoicePreviewService(env as never, gateway as never, routing as never, repo as never, redis as never, db as never);
    const module = await Test.createTestingModule({ controllers: [PetrosVoicePreviewController], providers: [
      { provide: PetrosVoicePreviewService, useValue: service }, { provide: API_ENV, useValue: env },
      { provide: StudentAuthService, useValue: {} }, { provide: StudentSessionService, useValue: sessions },
      { provide: StudentAuthGuard, useFactory: () => new StudentAuthGuard({ resolvePrincipal: async () => principal } as never, sessions as never, env as never) },
      { provide: StudentPermissionsGuard, useFactory: () => new StudentPermissionsGuard(new Reflector()) },
      { provide: StudentPortalGuard, useFactory: () => new StudentPortalGuard({ isPortalEnabled: async () => true } as never) },
      { provide: StudentRateLimitGuard, useFactory: () => new StudentRateLimitGuard(new Reflector(), env as never, redis as never) },
    ] })
      .overrideGuard(StudentAuthGuard).useValue(new StudentAuthGuard({ resolvePrincipal: async () => principal } as never, sessions as never, env as never))
      .overrideGuard(StudentPermissionsGuard).useValue(new StudentPermissionsGuard(new Reflector()))
      .overrideGuard(StudentPortalGuard).useValue(new StudentPortalGuard({ isPortalEnabled: async () => true } as never))
      .overrideGuard(StudentRateLimitGuard).useValue(new StudentRateLimitGuard(new Reflector(), env as never, redis as never))
      .compile();
    app = module.createNestApplication(); app.setGlobalPrefix('v1'); await app.init();
  });
  afterAll(async () => { await app?.close(); });
  const path = '/v1/student/petros/companion/voice-preview';
  it('rejects missing/expired sessions and unauthorized speech before dispatch', async () => {
    await supertest(app.getHttpServer()).get(`${path}/status`).expect(401);
    await supertest(app.getHttpServer()).get(`${path}/status`).set('Cookie', 'isolated=expired').expect(401);
    await supertest(app.getHttpServer()).post(`${path}/speech`).send({}).expect(401);
  });
  it('loads sanitized route status using the actual admitted controller', async () => {
    const result = await supertest(app.getHttpServer()).get(`${path}/status`).set('Cookie', 'isolated=allowed').expect(200);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.body).toMatchObject({ state: 'ready', tts: [{ modelKey: 'tts-1' }] });
    expect(JSON.stringify(result.body)).not.toContain('synthetic-not-secret');
  });
  it('reproduces frontend-only enablement as a precise backend 404', async () => {
    env.PETROS_V2_COMPANION_PLAYGROUND_ENABLED = false;
    const result = await supertest(app.getHttpServer()).get(`${path}/status`).set('Cookie', 'isolated=allowed').expect(404);
    expect(result.body.code).toBe('PETROS_PREVIEW_DISABLED'); env.PETROS_V2_COMPANION_PLAYGROUND_ENABLED = true;
  });
  it('reports spending approval and expired approval independently', async () => {
    env.PETROS_V2_VOICE_PREVIEW_PAID_APPROVED = false;
    const result = await supertest(app.getHttpServer()).get(`${path}/status`).set('Cookie', 'isolated=allowed').expect(200);
    expect(result.body.reasonCode).toBe('spending_approval_required');
    env.PETROS_V2_VOICE_PREVIEW_PAID_APPROVED = true;
    env.PETROS_V2_VOICE_PREVIEW_APPROVAL_EXPIRES_AT = '2000-01-01';
    const expired = await supertest(app.getHttpServer()).get(`${path}/status`).set('Cookie', 'isolated=allowed').expect(200);
    expect(expired.body.reasonCode).toBe('spending_approval_required');
    expect(gateway.execute).not.toHaveBeenCalled(); expect(redis.acquireStudentQuota).not.toHaveBeenCalled();
  });
});
