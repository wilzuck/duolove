import './bootstrap-env.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/errors.js';
import { getEnv, isProd } from './config/env.js';

export async function createApp() {
  const env = getEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, logger: env.NODE_ENV === 'test' ? ['error'] : undefined });
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());
  app.enableCors({ origin: env.APP_URL, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());

  if (!isProd()) {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('DuoMatch API').setDescription('API REST de DuoMatch. Authentification par cookie de session httpOnly `duomatch_sid`.').setVersion('0.1.0').addCookieAuth('duomatch_sid').build());
    SwaggerModule.setup('api/docs', app, doc);
  }
  return app;
}

async function bootstrap() {
  const app = await createApp();
  await app.listen(getEnv().PORT);
  console.warn(`DuoMatch API prête sur http://localhost:${getEnv().PORT}/api (docs : /api/docs)`);
}

if (process.env.NODE_ENV !== 'test') void bootstrap();
