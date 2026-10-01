import fs from 'fs';
import path from 'path';
import os from 'os';
import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import { ENV } from '../config/env.js';
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
      const allUsers = Array.from(diskDb.users.values());
      const totalUsers = allUsers.length;
      const photographers = allUsers.filter((u: any) => u.role === 'PHOTOGRAPHER').length;
      const admins = allUsers.filter((u: any) => u.role === 'ADMIN').length;

      const allEvents = Array.from(diskDb.events.values());
      const totalEvents = allEvents.length;
      const totalPhotos = diskDb.photos.size;

      // Count total faces stored
      let totalFacesIndexed = 0;
      for (const faces of diskDb.faces.values()) {
        totalFacesIndexed += (faces || []).length;
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
          activeNow: Math.max(1, totalUsers),
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
      const allUsers = Array.from(diskDb.users.values()).map((u: any) => {
        // Collect all photographer IDs for this user
        const photoIds = new Set<string>([u.id, `photo_${u.id}`]);
        for (const p of diskDb.photographers.values()) {
          if (p.userId === u.id) {
            photoIds.add(p.id);
          }
        }

        // Count events created by this user
        const userEvents = Array.from(diskDb.events.values()).filter(
          (e: any) => photoIds.has(e.photographerId) || (diskDb.users.size === 1)
        );

        return {
          id: u.id,
          fullName: u.fullName || u.name,
          email: u.email,
          role: u.role || 'PHOTOGRAPHER',
          createdAt: u.createdAt || new Date().toISOString(),
          eventsCount: userEvents.length,
        };
      });

      res.status(200).json(allUsers);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to list users.' });
    }
  }

  // 4. Delete Any User (Admin Master Control)
  static async deleteUser(req: Request, res: Response): Promise<void> {
    try {
      const userId = String(req.params.id);
      let userKey: string | null = null;
      let targetUser: any = null;

      for (const [key, u] of diskDb.users.entries()) {
        if (u.id === userId || key === userId || u.email === userId) {
          userKey = key;
          targetUser = u;
          break;
        }
      }

      if (!targetUser || !userKey) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }

      // Collect all photographer IDs for this user
      const photoIds = new Set<string>([targetUser.id, `photo_${targetUser.id}`]);
      for (const [pId, p] of diskDb.photographers.entries()) {
        if (p.userId === targetUser.id) {
          photoIds.add(pId);
          photoIds.add(p.id);
          diskDb.photographers.delete(pId);
        }
      }

      // Delete all events belonging to this user
      const userEvents = Array.from(diskDb.events.values()).filter(
        (e: any) => photoIds.has(e.photographerId) || e.photographerId === targetUser.id
      );
      for (const ev of userEvents) {
        await EventService.deleteEvent(ev.id);
      }

      diskDb.users.delete(userKey);
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
      const events = Array.from(diskDb.events.values()).map((ev: any) => {
        const photographer =
          diskDb.photographers.get(ev.photographerId) ||
          Array.from(diskDb.photographers.values()).find(
            (p: any) => p.id === ev.photographerId || p.userId === ev.photographerId
          );

        let creator: any = null;
        if (photographer?.userId) {
          creator = Array.from(diskDb.users.values()).find((u: any) => u.id === photographer.userId);
        }
        if (!creator) {
          creator = Array.from(diskDb.users.values()).find(
            (u: any) => u.id === ev.photographerId || u.email === ev.photographerId
          );
        }
        if (!creator && diskDb.users.size === 1) {
          creator = Array.from(diskDb.users.values())[0];
        }

        const faces = diskDb.faces.get(ev.id) || [];
        return {
          ...ev,
          name: ev.title || ev.coupleNames || 'Wedding Event',
          creatorName: creator ? creator.fullName || creator.name : 'Master Studio',
          creatorEmail: creator ? creator.email : 'studio@wedsnap.ai',
          totalFacesIndexed: faces.length,
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
