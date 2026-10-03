import express from 'express';
import cors from 'cors';
import { ENV } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';
import { eventRouter } from './routes/event.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { adminRouter } from './routes/admin.routes.js';

import path from 'path';
import fs from 'fs';

import { diskDb, getProjectRoot } from './db/diskDb.js';
import { prisma } from './db/prisma.js';

const app = express();

// Middlewares - Allow all origins in production or local development
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '25mb' }));

// Static files for uploaded photos (direct disk hits)
app.use('/uploads', express.static(path.resolve(getProjectRoot(), 'uploads')));

// Self-healing fallback for missing upload files (e.g. after ephemeral container restart on Render/Railway)
app.get('/uploads/:eventId/:filename', async (req, res, next) => {
  try {
    const { eventId, filename } = req.params;
    const photoId = filename.replace(/\.[^.]+$/, '');

    let imageData: string | null = null;
    let mimeType = 'image/jpeg';

    // 1. Check PostgreSQL Prisma
    try {
      const p = await prisma.photo.findFirst({
        where: {
          OR: [
            { id: photoId },
            { fileName: filename },
            { storageKeyOriginal: `/uploads/${eventId}/${filename}` },
          ],
        },
      });
      if (p && (p.imageData || p.storageKeyPreview)) {
        imageData = p.imageData || p.storageKeyPreview;
        mimeType = p.mimeType || 'image/jpeg';
      }
    } catch {
      // Prisma offline or not available
    }

    // 2. Check diskDb
    if (!imageData) {
      const dp = diskDb.photos.get(photoId);
      if (dp && (dp as any).imageData) {
        imageData = (dp as any).imageData;
      }
    }

    if (imageData && imageData.includes('base64,')) {
      const parts = imageData.split('base64,');
      const base64Data = parts[1];
      const detectedMime = parts[0].replace('data:', '').replace(';', '');
      if (detectedMime) mimeType = detectedMime;

      const buffer = Buffer.from(base64Data, 'base64');

      // Rehydrate physical file back to disk for subsequent direct static serving
      try {
        const uploadDir = path.resolve(getProjectRoot(), 'uploads', eventId);
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const targetPath = path.join(uploadDir, filename);
        fs.writeFileSync(targetPath, buffer);
      } catch (err) {
        console.warn(`[Self-Healing] Could not rehydrate ${filename} to disk:`, err);
      }

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    }

    return res.status(404).send('Photo not found');
  } catch (err) {
    next(err);
  }
});

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
