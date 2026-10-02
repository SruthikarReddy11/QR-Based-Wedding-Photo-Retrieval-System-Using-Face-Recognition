import fs from 'fs';
import path from 'path';
import os from 'os';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { ENV } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { diskDb, getProjectRoot } from '../db/diskDb.js';
import { EventService } from '../services/event.service.js';
import { PhotoService } from '../services/photo.service.js';
import { verifyAdminPin } from '../config/adminPin.js';

function getDirSize(dirPath: string): number {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getDirSize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch {
    // ignore
  }
  return size;
}

export class AdminController {
  // 1. Master Security PIN Verification
  static async verifyPin(req: Request, res: Response): Promise<void> {
    try {
      const { pin } = req.body;
      if (!verifyAdminPin(pin)) {
        res.status(401).json({ error: 'Incorrect Master PIN. Access denied.' });
        return;
      }

      // Generate 24-hour master admin token
      const token = jwt.sign(
        {
          id: 'master_admin_session',
          role: 'ADMIN',
          isAdmin: true,
          email: 'admin@wedsnap.ai',
          name: 'Master Administrator',
        },
        ENV.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(200).json({
        success: true,
        message: 'Master Admin authentication successful.',
        token,
        admin: {
          role: 'ADMIN',
          name: 'Master Administrator',
          authorizedAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to authenticate PIN.' });
    }
  }

  // 2. Comprehensive System Health, Memory, & User Statistics
  static async getSystemStats(req: Request, res: Response): Promise<void> {
    try {
      // Memory Diagnostics
      const nodeMem = process.memoryUsage();
      const totalOsMem = os.totalmem();
      const freeOsMem = os.freemem();
      const usedOsMem = totalOsMem - freeOsMem;
      const osMemPercent = ((usedOsMem / totalOsMem) * 100).toFixed(1);

      // Cloud Free Tier Container RAM estimation (standard 512MB limit)
      const containerRamLimitMB = 512;
      const nodeRssMB = Math.round(nodeMem.rss / (1024 * 1024));
      const heapUsedMB = Math.round(nodeMem.heapUsed / (1024 * 1024));
      const heapTotalMB = Math.round(nodeMem.heapTotal / (1024 * 1024));
      const containerPercent = ((nodeRssMB / containerRamLimitMB) * 100).toFixed(1);

      // Disk storage calculation
      const uploadsDir = path.resolve(getProjectRoot(), 'uploads');
      const uploadsSizeBytes = getDirSize(uploadsDir);
      const uploadsSizeMB = (uploadsSizeBytes / (1024 * 1024)).toFixed(2);

      // AI Microservice Health & Memory
      let aiHealth: any = { status: 'unknown' };
      try {
        const aiRes = await fetch(`${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/health`, {
          signal: AbortSignal.timeout(2000),
        });
        if (aiRes.ok) {
          aiHealth = await aiRes.json();
        }
      } catch {
        aiHealth = { status: 'offline or starting' };
      }

      // User & Event Metrics
      const userMap = new Map<string, any>();
      try {
        const prismaUsers = await prisma.user.findMany({
          include: { photographer: true },
        });
        for (const u of prismaUsers) {
          const key = (u.email || u.id).toLowerCase();
          userMap.set(key, {
            id: u.id,
            email: u.email,
            fullName: u.fullName,
            role: u.role || (u.photographer ? 'PHOTOGRAPHER' : 'USER'),
            createdAt: u.createdAt,
          });
        }
      } catch {
        // Prisma not available or offline
      }

      for (const u of diskDb.users.values()) {
        if (!u) continue;
        const key = (u.email || u.id).toLowerCase();
        if (!userMap.has(key)) {
          userMap.set(key, {
            id: u.id,
            email: u.email,
            fullName: u.fullName || u.name,
            role: u.role || 'PHOTOGRAPHER',
            createdAt: u.createdAt,
          });
        }
      }

      const allUsers = Array.from(userMap.values());
      const totalUsers = allUsers.length;
      const photographers = allUsers.filter((u: any) => u.role === 'PHOTOGRAPHER').length;
      const admins = allUsers.filter((u: any) => u.role === 'ADMIN').length;

      const allEvents = await EventService.getEvents();
      const totalEvents = allEvents.length;
      let totalPhotos = diskDb.photos.size;
      try {
        const pCount = await prisma.photo.count();
        totalPhotos = Math.max(totalPhotos, pCount);
      } catch {
        // ignore
      }

      // Count total faces stored
      let totalFacesIndexed = 0;
      for (const faces of diskDb.faces.values()) {
        totalFacesIndexed += (faces || []).length;
      }
      try {
        const fCount = await prisma.faceEmbedding.count();
        totalFacesIndexed = Math.max(totalFacesIndexed, fCount);
      } catch {
        // ignore
      }

      res.status(200).json({
        system: {
          uptimeSeconds: Math.round(process.uptime()),
          platform: `${os.type()} ${os.release()} (${os.arch()})`,
          nodeVersion: process.version,
          cpuCores: os.cpus().length,
          databaseType: process.env.DATABASE_URL ? 'PostgreSQL (Cloud Permanent)' : 'Persistent JSON Storage Engine',
          isPostgresConnected: Boolean(process.env.DATABASE_URL),
        },
        memory: {
          containerLimitMB: containerRamLimitMB,
          nodeRssMB,
          nodeHeapUsedMB: heapUsedMB,
          nodeHeapTotalMB: heapTotalMB,
          containerUsagePercent: parseFloat(containerPercent),
          osTotalMB: Math.round(totalOsMem / (1024 * 1024)),
          osUsedMB: Math.round(usedOsMem / (1024 * 1024)),
          osFreeMB: Math.round(freeOsMem / (1024 * 1024)),
          osUsagePercent: parseFloat(osMemPercent),
          status: nodeRssMB > 420 ? 'CRITICAL' : nodeRssMB > 300 ? 'WARNING' : 'OPTIMAL',
        },
        storage: {
          uploadsDir,
          uploadsSizeBytes,
          uploadsSizeMB: parseFloat(uploadsSizeMB),
          photosStoredOnDisk: totalPhotos,
        },
        users: {
          totalUsers,
          photographers,
          admins,
          activeNow: totalUsers > 0 ? 1 : 0,
        },
        catalog: {
          totalEvents,
          totalPhotos,
          totalFacesIndexed,
        },
        aiService: aiHealth,
      });
    } catch (err: any) {
      console.error('[Admin Stats Error]', err);
      res.status(500).json({ error: err.message || 'Failed to generate system stats.' });
    }
  }

  // 3. List All Users
  static async listUsers(_req: Request, res: Response): Promise<void> {
    try {
      const userMap = new Map<string, any>();
      const allEvents = await EventService.getEvents();

      try {
        const prismaUsers = await prisma.user.findMany({
          include: { photographer: true },
        });
        for (const u of prismaUsers) {
          const key = (u.email || u.id).toLowerCase();
          userMap.set(key, {
            id: u.id,
            fullName: u.fullName,
            email: u.email,
            role: u.role || 'PHOTOGRAPHER',
            createdAt: u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
            photographerId: u.photographer?.id,
          });
        }
      } catch {
        // Prisma not available
      }

      for (const u of diskDb.users.values()) {
        if (!u) continue;
        const key = (u.email || u.id).toLowerCase();
        if (!userMap.has(key)) {
          userMap.set(key, {
            id: u.id,
            fullName: u.fullName || u.name,
            email: u.email,
            role: u.role || 'PHOTOGRAPHER',
            createdAt: u.createdAt || new Date().toISOString(),
          });
        }
      }

      const usersList = Array.from(userMap.values()).map((u) => {
        // Collect all possible IDs associated with this user
        const matchIds = new Set<string>([u.id, (u.email || '').toLowerCase()]);
        if (u.photographerId) {
          matchIds.add(u.photographerId);
        }
        for (const p of diskDb.photographers.values()) {
          if (p.userId === u.id || p.id === u.id) {
            matchIds.add(p.id);
            matchIds.add(p.userId);
          }
        }

        // Count events created by this user
        const userEvents = allEvents.filter(
          (e: any) =>
            matchIds.has(e.photographerId) ||
            matchIds.has(e.photographer?.userId) ||
            matchIds.has((e.photographer?.email || '').toLowerCase()) ||
            userMap.size === 1
        );

        return {
          id: u.id,
          fullName: u.fullName || 'Photographer',
          email: u.email,
          role: u.role || 'PHOTOGRAPHER',
          createdAt: u.createdAt,
          eventsCount: userEvents.length,
        };
      });

      res.status(200).json(usersList);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list users.' });
    }
  }

  // 4. Delete Any User (Admin Master Control)
  static async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = String(req.params.id);
      let targetUser: any = null;
      let userKey: string | null = null;

      // 1. Check diskDb
      for (const [key, u] of diskDb.users.entries()) {
        if (u.id === userId || key === userId || u.email === userId) {
          userKey = key;
          targetUser = u;
          break;
        }
      }

      // 2. Check Prisma
      let prismaUser: any = null;
      try {
        prismaUser = await prisma.user.findFirst({
          where: {
            OR: [
              { id: userId },
              { email: userId },
            ],
          },
          include: { photographer: true },
        });
        if (prismaUser && !targetUser) {
          targetUser = prismaUser;
        }
      } catch {}

      if (!targetUser && !prismaUser) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      // Collect all photographer IDs for this user
      const photoIds = new Set<string>([
        userId,
        targetUser?.id,
        targetUser?.email,
        prismaUser?.id,
        prismaUser?.email,
        prismaUser?.photographer?.id,
      ].filter(Boolean) as string[]);

      for (const [pId, p] of diskDb.photographers.entries()) {
        if (photoIds.has(p.userId) || photoIds.has(p.id)) {
          photoIds.add(pId);
          photoIds.add(p.id);
          diskDb.photographers.delete(pId);
        }
      }

      // Delete all events belonging to this user
      const allEvents = await EventService.getEvents();
      const userEvents = allEvents.filter((e: any) => photoIds.has(e.photographerId));
      for (const ev of userEvents) {
        await EventService.deleteEvent(ev.id);
      }

      // Delete from Prisma
      if (prismaUser) {
        try {
          await prisma.user.delete({ where: { id: prismaUser.id } });
        } catch (e: any) {
          console.warn('[AdminController] Prisma user delete notice:', e.message);
        }
      }

      // Delete from diskDb
      if (userKey) {
        diskDb.users.delete(userKey);
      }
      for (const [key, u] of diskDb.users.entries()) {
        if (photoIds.has(u.id) || photoIds.has(u.email)) {
          diskDb.users.delete(key);
        }
      }
      diskDb.save();

      res.status(200).json({
        message: `User and their ${userEvents.length} event(s) deleted successfully.`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to delete user.' });
    }
  }

  // 5. List All Events Across All Photographers
  static async listAllEvents(_req: Request, res: Response): Promise<void> {
    try {
      const allEvents = await EventService.getEvents();

      // Build user / photographer lookup maps
      const userLookup = new Map<string, any>();
      try {
        const pUsers = await prisma.user.findMany({ include: { photographer: true } });
        for (const u of pUsers) {
          userLookup.set(u.id, u);
          userLookup.set((u.email || '').toLowerCase(), u);
          if (u.photographer) {
            userLookup.set(u.photographer.id, u);
          }
        }
      } catch {}

      for (const u of diskDb.users.values()) {
        if (!u) continue;
        userLookup.set(u.id, u);
        if (u.email) userLookup.set(u.email.toLowerCase(), u);
      }

      for (const p of diskDb.photographers.values()) {
        if (!p) continue;
        const owner = userLookup.get(p.userId);
        if (owner) {
          userLookup.set(p.id, owner);
        }
      }

      const events = allEvents.map((ev: any) => {
        let creator = userLookup.get(ev.photographerId);
        if (!creator && userLookup.size > 0) {
          const uniqueUsers = Array.from(new Set(userLookup.values()));
          if (uniqueUsers.length === 1) {
            creator = uniqueUsers[0];
          }
        }

        const faces = diskDb.faces.get(ev.id) || [];
        const totalFaces = faces.length || ev.faceCount || 0;

        return {
          ...ev,
          name: ev.title || ev.coupleNames || 'Wedding Event',
          creatorName: creator ? (creator.fullName || creator.name) : 'Master Studio',
          creatorEmail: creator ? creator.email : 'studio@wedsnap.ai',
          totalFacesIndexed: totalFaces,
        };
      });

      res.status(200).json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list all events.' });
    }
  }

  // 6. Delete Any Event (Admin Master Control)
  static async deleteEvent(req: Request, res: Response): Promise<void> {
    try {
      const eventId = String(req.params.id);
      const existed = await EventService.deleteEvent(eventId);
      if (!existed) {
        res.status(404).json({ error: 'Event not found.' });
        return;
      }

      res.status(200).json({
        message: 'Event and all associated photos and face embeddings removed cleanly.',
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to delete event.' });
    }
  }

  // 7. Force Purge Memory (Node.js Garbage Collection + Python AI GC)
  static async purgeMemory(_req: Request, res: Response): Promise<void> {
    try {
      // 1. Run Node.js GC if available
      let nodeGcRan = false;
      if (global.gc) {
        global.gc();
        nodeGcRan = true;
      }

      // 2. Call Python AI Microservice Purge
      let aiResult: any = null;
      try {
        const aiRes = await fetch(`${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/purge-memory`, {
          method: 'POST',
        });
        if (aiRes.ok) {
          aiResult = await aiRes.json();
        }
      } catch (err: any) {
        aiResult = { error: err.message };
      }

      res.status(200).json({
        message: 'System memory purge executed successfully.',
        nodeGcRan,
        aiResult,
        memoryAfter: {
          nodeRssMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
          heapUsedMB: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to purge memory.' });
    }
  }

  // 8. Download Full Database Backup JSON
  static async backupDatabase(_req: Request, res: Response): Promise<void> {
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        users: Object.fromEntries(diskDb.users.entries()),
        photographers: Object.fromEntries(diskDb.photographers.entries()),
        events: Object.fromEntries(diskDb.events.entries()),
        photos: Object.fromEntries(diskDb.photos.entries()),
        faces: Object.fromEntries(diskDb.faces.entries()),
      };

      const filename = `wedsnap_backup_${Date.now()}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(JSON.stringify(data, null, 2));
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to create backup.' });
    }
  }

  // 9. Restore Full Database from Backup JSON
  static async restoreDatabase(req: Request, res: Response): Promise<void> {
    try {
      const backupData = req.body;
      if (!backupData || typeof backupData !== 'object') {
        res.status(400).json({ error: 'Invalid backup format. Must be JSON object.' });
        return;
      }

      if (backupData.users) {
        diskDb.users = new Map(Object.entries(backupData.users));
      }
      if (backupData.events) {
        diskDb.events = new Map(Object.entries(backupData.events));
      }
      if (backupData.photos) {
        diskDb.photos = new Map(Object.entries(backupData.photos));
      }
      if (backupData.faces) {
        diskDb.faces = new Map(Object.entries(backupData.faces));
      }

      diskDb.save();

      res.status(200).json({
        message: 'Database restored successfully!',
        restored: {
          users: diskDb.users.size,
          events: diskDb.events.size,
          photos: diskDb.photos.size,
          facesEvents: diskDb.faces.size,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to restore database.' });
    }
  }
}
