import express from 'express';
import cors from 'cors';
import { ENV } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';
import { eventRouter } from './routes/event.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { adminRouter } from './routes/admin.routes.js';

import path from 'path';
import fs from 'fs';

const app = express();

// Middlewares - Allow all origins in production or local development
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '25mb' }));

// Static files for uploaded photos
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Healthcheck & Welcome
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'WedSnap API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount versioned API routes
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/events', eventRouter);
app.use('/api/v1/public', publicRouter);
app.use('/api/v1/admin', adminRouter);

// Serve Web Frontend SPA in production if built dist exists
const possibleDistPaths = [
  path.resolve(process.cwd(), 'apps/web/dist'),
  path.resolve(process.cwd(), '../web/dist'),
  path.resolve(process.cwd(), 'dist/web'),
];
const distPath = possibleDistPaths.find((p) => fs.existsSync(p));

if (distPath) {
  console.log(`[Static] Serving web frontend SPA from: ${distPath}`);
  app.use(express.static(distPath));

  app.get('*', (req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path.startsWith('/health')
    ) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

app.listen(ENV.PORT, '0.0.0.0', () => {
  console.log(`✨ WedSnap API Server running on http://0.0.0.0:${ENV.PORT}`);
  console.log(`🚀 Environment: ${ENV.NODE_ENV}`);
});
