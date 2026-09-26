import { setDefaultResultOrder } from 'node:dns';
import { Logger, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

// Some Google hosts resolve to IPv6 first. Without a working IPv6 route,
// Node's fetch hangs on those addresses until it times out, so prefer IPv4.
setDefaultResultOrder('ipv4first');

const WEAK_SECRETS = new Set([
  '',
  'change-me',
  'socialdeal-dev-secret',
  'secret',
]);

function assertProductionConfig() {
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.JWT_SECRET ?? '';
  // Anyone can mint admin tokens with a default secret, and the defaults are
  // in a public repo. Refuse to start rather than run like that.
  if (WEAK_SECRETS.has(secret) || secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set to a random string of 32+ characters in production.',
    );
  }
  if (!process.env.FRONTEND_URL) {
    throw new Error('FRONTEND_URL must be set in production (used for CORS).');
  }
}

async function bootstrap() {
  assertProductionConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // A business logo for the review poster travels as a data URL (~300 KB max).
  app.useBodyParser('json', { limit: '600kb' });

  // Behind nginx every request arrives from 127.0.0.1. Without this, rate
  // limiting would treat all users as one and lock the whole site out.
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(
    helmet({
      // widget.js and the embed JSON are loaded by other people's websites;
      // helmet's default same-origin policy would block exactly that.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // This is a JSON API; the CSP belongs on the frontend.
      contentSecurityPolicy: false,
    }),
  );

  // An Origin header never ends in "/", so "https://site.com/" in .env
  // would never match and every call would fail as a CORS error.
  const frontends = (process.env.FRONTEND_URL ?? 'http://localhost:3002')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const devOrigins =
    process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:3000', 'http://localhost:3002'];

  app.enableCors({
    // The embed routes answer any origin themselves after checking the
    // widget's allow list; everything else is only for our own frontend.
    origin: (origin, callback) => {
      if (!origin || [...frontends, ...devOrigins].includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(
    new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter),
  );

  // Lets Prisma and Redis close cleanly when pm2 restarts the process.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on ${port}`);
}
void bootstrap();
