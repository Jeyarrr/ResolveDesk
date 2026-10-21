import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { Config } from './config/env.js';
import type { Database } from './db/connection.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFound } from './middleware/errors.js';
export function createApp(db: Database, env: Config) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    }),
  );
  app.use(cookieParser());
  // Log the path only: omit query strings, headers, bodies, and credentials.
  morgan.token('safe-path', (request) => request.url?.split('?')[0] ?? '/');
  app.use(
    morgan(':method :safe-path :status :response-time ms', { skip: () => env.NODE_ENV === 'test' }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', apiRouter(db, env));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
