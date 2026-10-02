import { prisma } from '../db/prisma.js';
import { CreateEventDto, UpdateEventDto, WeddingEvent, PhotographerDashboardStats } from '@wednap/shared';
import { PhotoService } from './photo.service.js';
import { diskDb } from '../db/diskDb.js';

export class EventService {
  static async createEvent(photographerId: string, dto: CreateEventDto, userId?: string): Promise<WeddingEvent> {
    const title = dto.title || (dto.coupleNames ? `${dto.coupleNames} Wedding Memories` : 'Wedding Event');
    const baseSlug = dto.slug || (dto.coupleNames || 'wedding').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const slug = `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`;
    const eventDate = dto.eventDate ? new Date(dto.eventDate) : new Date();
    const coverPhotoUrl = dto.coverPhotoUrl || 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80';

    let createdEvent: WeddingEvent | null = null;

    // 1. Try Prisma first if database is connected
    try {
      // Ensure photographer exists in Prisma before creating event to satisfy foreign key constraint
      let validPhotographerId = photographerId;
      try {
        const pRecord = await prisma.photographer.findFirst({
          where: {
            OR: [
              { id: photographerId },
              ...(userId ? [{ userId }] : []),
            ],
          },
        });
        if (pRecord) {
          validPhotographerId = pRecord.id;
        } else if (userId) {
          const newP = await prisma.photographer.create({
            data: {
              userId,
              studioName: 'Photography Studio',
            },
          });
          validPhotographerId = newP.id;
        }
      } catch {
        // Continue with original photographerId if check throws
      }

      const created = await prisma.event.create({
        data: {
          photographerId: validPhotographerId,
          title,
          slug,
          coupleNames: dto.coupleNames,
          eventDate,
          venueCity: dto.venueCity || 'Venue City',
          venueName: dto.venueName || 'Grand Ballroom',
          description: dto.description || '',
          coverPhotoUrl,
          allowFullGalleryView: dto.allowFullGalleryView ?? true,
          allowGuestDownloads: dto.allowGuestDownloads ?? true,
        },
      });

      createdEvent = {
        ...created,
        eventDate: created.eventDate.toISOString(),
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    } catch (err: any) {
      console.warn('[EventService] Prisma event create fallback to diskDb:', err.message);
    }

    // 2. If Prisma creation didn't happen, create standard event object
    if (!createdEvent) {
      const newId = `event_${Date.now()}`;
      createdEvent = {
        id: newId,
        photographerId,
        title,
        slug,
        coupleNames: dto.coupleNames,
        eventDate: eventDate.toISOString(),
        venueCity: dto.venueCity || 'Venue City',
        venueName: dto.venueName || 'Grand Ballroom',
        description: dto.description || '',
        coverPhotoUrl,
        isActive: true,
        allowFullGalleryView: dto.allowFullGalleryView ?? true,
        allowGuestDownloads: dto.allowGuestDownloads ?? true,
        photoCount: 0,
        faceCount: 0,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // 3. Always store in diskDb so Master Gallery, photos, and Admin portal are 100% in sync
    diskDb.events.set(createdEvent.id, createdEvent);
    diskDb.save();

    return createdEvent;
  }

  static async getEvents(photographerId?: string, userId?: string): Promise<WeddingEvent[]> {
    const eventMap = new Map<string, WeddingEvent>();

    // 1. Fetch from Prisma database if available
    try {
      let whereClause: any = undefined;
      if (photographerId || userId) {
        const idList = [photographerId, userId].filter(Boolean) as string[];
        whereClause = {
          OR: [
            { photographerId: { in: idList } },
            ...(userId ? [{ photographer: { userId } }] : []),
            ...(photographerId ? [{ photographer: { id: photographerId } }] : []),
          ],
        };
      }

      const prismaEvents = await prisma.event.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
      });

      for (const e of prismaEvents) {
        eventMap.set(e.id, {
          ...e,
          eventDate: e.eventDate.toISOString(),
          createdAt: e.createdAt.toISOString(),
          updatedAt: e.updatedAt.toISOString(),
        });
      }
    } catch {
      // Prisma not available
    }

    // 2. Read from diskDb and merge
    const diskEvents = Array.from(diskDb.events.values());
    if (photographerId || userId) {
      // Collect all possible IDs associated with this photographer / user
      const matchingIds = new Set<string>();
      if (photographerId) matchingIds.add(photographerId);
      if (userId) {
        matchingIds.add(userId);
        matchingIds.add(`photo_${userId}`);
      }

      // Also check Prisma user records to connect Prisma IDs with diskDb email/studio
      try {
        const pUsers = await prisma.user.findMany({
          where: {
            OR: [
              ...(userId ? [{ id: userId }] : []),
              ...(photographerId ? [{ id: photographerId }] : []),
            ],
          },
          include: { photographer: true },
        });
        for (const u of pUsers) {
          matchingIds.add(u.id);
          if (u.email) matchingIds.add(u.email.toLowerCase());
          if (u.photographer) {
            matchingIds.add(u.photographer.id);
            matchingIds.add(u.photographer.userId);
          }
        }
      } catch {
        // ignore
      }

      for (const p of diskDb.photographers.values()) {
        if (matchingIds.has(p.id) || matchingIds.has(p.userId)) {
          matchingIds.add(p.id);
          matchingIds.add(p.userId);
          matchingIds.add(`photo_${p.userId}`);
        }
      }

      for (const u of diskDb.users.values()) {
        if (
          matchingIds.has(u.id) ||
          (u.email && matchingIds.has(u.email.toLowerCase())) ||
          matchingIds.has(`photo_${u.id}`)
        ) {
          matchingIds.add(u.id);
          if (u.email) matchingIds.add(u.email.toLowerCase());
          matchingIds.add(`photo_${u.id}`);
        }
      }

      // Check distinct users on disk
      const distinctUsers = new Set(
        Array.from(diskDb.users.values()).map((u: any) => (u.email || u.id).toLowerCase())
      );
      const distinctPhotographers = new Set(
        Array.from(diskDb.photographers.values()).map((p: any) => p.userId || p.id)
      );

      // If only 1 user or photographer profile exists on disk, all disk events belong to them
      if (distinctUsers.size <= 1 || distinctPhotographers.size <= 1) {
        for (const e of diskEvents) {
          if (!eventMap.has(e.id)) {
            eventMap.set(e.id, e);
          }
        }
      } else {
        const filtered = diskEvents.filter((e) => matchingIds.has(e.photographerId));
        for (const e of filtered) {
          if (!eventMap.has(e.id)) {
            eventMap.set(e.id, e);
          }
        }
      }
    } else {
      // If no photographerId specified (admin list): merge all disk events
      for (const e of diskEvents) {
        if (!eventMap.has(e.id)) {
          eventMap.set(e.id, e);
        }
      }
    }

    return Array.from(eventMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  static async getEventById(id: string): Promise<WeddingEvent | null> {
    try {
      const event = await prisma.event.findFirst({
        where: {
          OR: [{ id }, { slug: id }],
        },
      });
      if (event) {
        return {
          ...event,
          eventDate: event.eventDate.toISOString(),
          createdAt: event.createdAt.toISOString(),
          updatedAt: event.updatedAt.toISOString(),
        };
      }
    } catch {
      // fallback
    }

    const direct = diskDb.events.get(id);
    if (direct) return direct;
    for (const ev of diskDb.events.values()) {
      if (ev.id === id || ev.slug === id) return ev;
    }
    if (diskDb.events.size === 1) {
      return Array.from(diskDb.events.values())[0];
    }
    return null;
  }

  static async getEventBySlug(slug: string): Promise<WeddingEvent | null> {
    try {
      const event = await prisma.event.findFirst({
        where: {
          OR: [{ slug }, { id: slug }],
        },
      });
      if (event) {
        return {
          ...event,
          eventDate: event.eventDate.toISOString(),
          createdAt: event.createdAt.toISOString(),
          updatedAt: event.updatedAt.toISOString(),
        };
      }
    } catch {
      // fallback
    }

    for (const ev of diskDb.events.values()) {
      if (ev.slug === slug || ev.id === slug) return ev;
    }
    if (diskDb.events.size === 1) {
      return Array.from(diskDb.events.values())[0];
    }
    return null;
  }

  static async incrementPhotoAndFaceCount(eventId: string, photosDelta: number, facesDelta: number): Promise<void> {
    try {
      await prisma.event.updateMany({
        where: { OR: [{ id: eventId }, { slug: eventId }] },
        data: {
          photoCount: { increment: photosDelta },
          faceCount: { increment: facesDelta },
        },
      });
    } catch {
      // ignore
    }

    let target = diskDb.events.get(eventId);
    if (!target) {
      for (const [key, ev] of diskDb.events.entries()) {
        if (ev.id === eventId || ev.slug === eventId) {
          target = ev;
          eventId = key;
          break;
        }
      }
    }
    if (target) {
      target.photoCount = (target.photoCount || 0) + photosDelta;
      target.faceCount = (target.faceCount || 0) + facesDelta;
      diskDb.events.set(eventId, target);
      diskDb.save();
    }
  }

  static async decrementPhotoAndFaceCount(eventId: string, facesDelta: number): Promise<void> {
    try {
      await prisma.event.updateMany({
        where: { OR: [{ id: eventId }, { slug: eventId }] },
        data: {
          photoCount: { decrement: 1 },
          faceCount: { decrement: facesDelta },
        },
      });
    } catch {
      // ignore
    }

    let target = diskDb.events.get(eventId);
    if (!target) {
      for (const [key, ev] of diskDb.events.entries()) {
        if (ev.id === eventId || ev.slug === eventId) {
          target = ev;
          eventId = key;
          break;
        }
      }
    }
    if (target) {
      target.photoCount = Math.max(0, (target.photoCount || 0) - 1);
      target.faceCount = Math.max(0, (target.faceCount || 0) - facesDelta);
      diskDb.events.set(eventId, target);
      diskDb.save();
    }
  }

  static async deleteEvent(id: string): Promise<boolean> {
    // 1. Delete all photos & embeddings for this event
    await PhotoService.deletePhotosByEvent(id);

    // 2. Delete from Prisma if DB connected
    let prismaDeleted = false;
    try {
      await prisma.event.delete({ where: { id } });
      prismaDeleted = true;
    } catch {
      // ignore
    }

    // 3. Delete from persistent diskDb store
    const existed = diskDb.events.has(id);
    diskDb.events.delete(id);
    diskDb.save();
    return existed || prismaDeleted;
  }

  static async getDashboardStats(photographerId?: string, userId?: string): Promise<PhotographerDashboardStats> {
    const allEvents = await this.getEvents(photographerId, userId);
    const totalPhotos = allEvents.reduce((acc, curr) => acc + (curr.photoCount || 0), 0);
    const facesDetected = allEvents.reduce((acc, curr) => acc + (curr.faceCount || 0), 0);

    return {
      totalEvents: allEvents.length,
      totalPhotos,
      facesDetected,
      totalSearches: 0,
      storageUsedBytes: totalPhotos * 4 * 1024 * 1024,
    };
  }
}
