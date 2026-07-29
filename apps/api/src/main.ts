import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';
// Load the workspace-root .env so the API has DATABASE_URL etc. when run via turbo (cwd = apps/api).
// override: true — a stale DATABASE_URL in the shell (e.g. localhost) must not win over repo .env.
loadDotenv({ path: join(__dirname, '../../../.env'), override: true });
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { loadApiEnv } from '@edrion/config';
import { AppModule } from './app.module';

/** Bounded request body — admin JSON payloads are small; cap blocks payload-flood DoS. */
const BODY_LIMIT = '512kb';

async function bootstrap() {
  const env = loadApiEnv();
  // Disable Nest's implicit body parser so we register one with an explicit size limit.
  const app = await NestFactory.create(AppModule, { bufferLogs: false, bodyParser: false });

  app.use(helmet());
  // CORS allowlist (comma-separated origins from API_CORS_ORIGINS); credentials for the cookie.
  app.enableCors({ origin: env.API_CORS_ORIGINS, credentials: true });
  // Stash the raw request body so signed-webhook handlers (e.g. parent payment settlement) can verify
  // an HMAC over the exact bytes received, before JSON parsing.
  app.use(
    json({
      limit: BODY_LIMIT,
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));
  app.setGlobalPrefix('v1');

  const config = new DocumentBuilder()
    .setTitle('Edrion Super Admin API')
    .setDescription('Internal control plane API. All actions are authenticated, authorised and audited.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(env.API_PORT);
  // eslint-disable-next-line no-console
  console.log(`Edrion API listening on :${env.API_PORT} — docs at /docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start API:', err);
  process.exit(1);
});
