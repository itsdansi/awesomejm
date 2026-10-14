import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const port = Number(process.env.PORT ?? '3001');
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError('PORT must be an integer from 0 to 65535.');
  }
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  await app.listen(port, process.env.HOST ?? '127.0.0.1');
  console.info(`AwesomeJM API listening on ${await app.getUrl()}/api/v1`);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
