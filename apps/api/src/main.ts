import { validateAccessConfig } from './auth/policy.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { INestApplication } from '@nestjs/common';

let cachedApp: INestApplication | undefined;

async function createApp(): Promise<INestApplication> {
  if (cachedApp) return cachedApp;
  validateAccessConfig();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(
    (
      _req: unknown,
      res: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'same-origin');
      next();
    },
  );
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.enableShutdownHooks();
  await app.init();
  cachedApp = app;
  return cachedApp;
}

// Export default handler for Vercel Serverless Functions
export default async function handler(req: unknown, res: unknown) {
  const app = await createApp();
  const server = app.getHttpAdapter().getInstance();
  return server(req, res);
}

// Standalone server for local development, docker, CI
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? '3001');
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError('PORT must be an integer from 0 to 65535.');
  }
  createApp()
    .then(async (app) => {
      await app.listen(port, process.env.HOST ?? '127.0.0.1');
      console.info(
        `Sajilo Jwellery API listening on ${await app.getUrl()}/api/v1`,
      );
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}

