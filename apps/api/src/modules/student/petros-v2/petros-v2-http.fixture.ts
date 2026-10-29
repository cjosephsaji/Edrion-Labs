/** Actual Nest controller/guards on disposable services. No production bootstrap or identity bypass. */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { json } from 'express';
import { API_ENV } from '../../../common/tokens';
import { RedisService } from '../../../common/redis/redis.service';
import { StudentAuthService } from '../auth/student-auth.service';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { StudentSessionService } from '../core/student-session.service';
import { StudentTenantInterceptor } from '../core/student-tenant.interceptor';
import { SurfacesService } from '../surfaces/surfaces.service';
import { StudentMeController } from '../me/student-me.controller';
import { StudentMeService } from '../me/student-me.service';
import { PetrosV2Controller } from './petros-v2.controller';
import { PetrosV2SessionService } from './petros-v2-session.service';
import { PetrosV2CommandWorker } from './petros-v2-command.worker';
import { PetrosV2OriginGuard } from './petros-v2-origin.guard';
import type { M4Fixture } from './petros-v2.fixture';
import { StudentPetrosLoopController } from '../petros-loop/petros-loop.controller';
import { PetrosLoopService } from '../petros-loop/petros-loop.service';
export async function m4HttpFixture(
  f: M4Fixture,
  worker = f.worker,
  v1?: PetrosLoopService,
  setup?: (app: import('express').Express) => void,
) {
  const env = {
    ...f.env,
    STUDENT_AUTH_DEV_HEADER: true,
    STUDENT_SESSION_COOKIE_NAME: f.env.STUDENT_SESSION_COOKIE_NAME ?? 'm4_student',
    RATE_LIMIT_ENABLED: false,
    REDIS_ENABLED: false,
    API_CORS_ORIGINS: f.env.API_CORS_ORIGINS ?? ['http://127.0.0.1:4944', 'http://localhost:4944'],
  };
  const sessions = new StudentSessionService(f.f.f.db, env),
    redis = new RedisService(env);
  // Vitest/esbuild omits TypeScript constructor metadata; use the real instances explicitly.
  Reflect.defineMetadata(
    'design:paramtypes',
    [PetrosV2SessionService, PetrosV2CommandWorker],
    PetrosV2Controller,
  );
  Reflect.defineMetadata('design:paramtypes', [StudentMeService], StudentMeController);
  Reflect.defineMetadata('design:paramtypes', [PetrosLoopService], StudentPetrosLoopController);
  const module = await Test.createTestingModule({
    controllers: [
      PetrosV2Controller,
      StudentMeController,
      ...(v1 ? [StudentPetrosLoopController] : []),
    ],
    providers: [
      ...(v1 ? [{ provide: PetrosLoopService, useValue: v1 }] : []),
      { provide: API_ENV, useValue: env },
      { provide: PetrosV2SessionService, useValue: f.sessions },
      { provide: PetrosV2CommandWorker, useValue: worker },
      { provide: StudentAuthService, useValue: f.auth },
      { provide: StudentSessionService, useValue: sessions },
      { provide: SurfacesService, useValue: f.surfaces },
      { provide: StudentMeService, useValue: new StudentMeService(f.f.f.db, f.surfaces) },
      { provide: RedisService, useValue: redis },
      StudentAuthGuard,
      StudentPermissionsGuard,
      StudentPortalGuard,
      StudentRateLimitGuard,
      PetrosV2OriginGuard,
    ],
  })
    .overrideGuard(StudentAuthGuard)
    .useValue(new StudentAuthGuard(f.auth, sessions, env))
    .overrideGuard(StudentPermissionsGuard)
    .useValue(new StudentPermissionsGuard(new Reflector()))
    .overrideGuard(StudentPortalGuard)
    .useValue(new StudentPortalGuard(f.surfaces))
    .overrideGuard(StudentRateLimitGuard)
    .useValue(new StudentRateLimitGuard(new Reflector(), env, redis))
    .overrideGuard(PetrosV2OriginGuard)
    .useValue(new PetrosV2OriginGuard(env))
    .compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('v1');
  app.use(json({ limit: '96kb' }));
  app.useGlobalInterceptors(new StudentTenantInterceptor(f.f.f.db));
  app.enableCors({ origin: env.API_CORS_ORIGINS, credentials: true });
  setup?.(app.getHttpAdapter().getInstance());
  await app.init();
  return app;
}
