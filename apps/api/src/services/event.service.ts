import { prisma } from '../db/prisma.js';
import { CreateEventDto, UpdateEventDto, WeddingEvent, PhotographerDashboardStats } from '@wednap/shared';
import { PhotoService } from './photo.service.js';
import { diskDb } from '../db/diskDb.js';

export class EventService {
  static async createEvent(photographerId: string, dto: CreateEventDto): Promise<WeddingEvent> {
    const baseSlug = dto.slug || dto.coupleNames.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const slug = `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`;

    try {
      const created = await prisma.event.create({
        data: {
          photographerId,
          title: dto.title,
          slug,
          coupleNames: dto.coupleNames,
          eventDate: new Date(dto.eventDate),
          venueCity: dto.venueCity,
          venueName: dto.venueName,
          description: dto.description,
          coverPhotoUrl: dto.coverPhotoUrl,
          allowFullGalleryView: dto.allowFullGalleryView ?? true,
          allowGuestDownloads: dto.allowGuestDownloads ?? true,
        },
      });

      return {
        ...created,
        eventDate: created.eventDate.toISOString(),
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    } catch (err: any) {
      console.warn('[EventService] Prisma fallback for createEvent:', err.message);

      const newId = `event_${Date.now()}`;
      const newEvent: WeddingEvent = {
        id: newId,
        photographerId,
        title: dto.title,
        slug,
        coupleNames: dto.coupleNames,
        eventDate: new Date(dto.eventDate).toISOString(),
        venueCity: dto.venueCity,
        venueName: dto.venueName,
        description: dto.description,
        coverPhotoUrl: dto.coverPhotoUrl || 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
        isActive: true,
        allowFullGalleryView: dto.allowFullGalleryView ?? true,
        allowGuestDownloads: dto.allowGuestDownloads ?? true,
        photoCount: 0,
        faceCount: 0,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      diskDb.events.set(newId, newEvent);
      diskDb.save();
      return newEvent;
    }
  }

  static async getEvents(photographerId?: string): Promise<WeddingEvent[]> {
    try {
      const events = await prisma.event.findMany({
        where: photographerId ? { photographerId } : undefined,
        orderBy: { createdAt: 'desc' },
      });

      return events.map((e: any) => ({
        ...e,
        eventDate: e.eventDate.toISOString(),
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      }));
    } catch {
      let results = Array.from(diskDb.events.values());
      if (photographerId) {
        // Collect all possible IDs associated with this photographer / user
        const matchingIds = new Set<string>([photographerId]);
        for (const p of diskDb.photographers.values()) {
          if (p.id === photographerId || p.userId === photographerId) {
            matchingIds.add(p.id);
            matchingIds.add(p.userId);
            matchingIds.add(`photo_${p.userId}`);
          }
        }
        for (const u of diskDb.users.values()) {
          if (u.id === photographerId || `photo_${u.id}` === photographerId) {
            matchingIds.add(u.id);
            matchingIds.add(`photo_${u.id}`);
          }
        }

        // If only 1 user exists in database, all events belong to this photographer
        if (diskDb.users.size <= 1) {
          return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }

        results = results.filter((e) => matchingIds.has(e.photographerId));
      }
      return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  static async getEventById(id: string): Promise<WeddingEvent | null> {
    try {
      const event = await prisma.event.findUnique({ where: { id } });
      if (!event) return diskDb.events.get(id) || null;
      return {
        ...event,
        eventDate: event.eventDate.toISOString(),
        createdAt: event.createdAt.toISOString(),
        updatedAt: event.updatedAt.toISOString(),
      };
    } catch {
      return diskDb.events.get(id) || null;
    }
  }

  static async getEventBySlug(slug: string): Promise<WeddingEvent | null> {
    try {
      const event = await prisma.event.findUnique({ where: { slug } });
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
      if (ev.slug === slug) return ev;
    }
    return null;
  }

  static async incrementPhotoAndFaceCount(eventId: string, photosDelta: number, facesDelta: number): Promise<void> {
    try {
      await prisma.event.update({
        where: { id: eventId },
        data: {
          photoCount: { increment: photosDelta },
          faceCount: { increment: facesDelta },
        },
      });
    } catch {
      const mem = diskDb.events.get(eventId);
      if (mem) {
        mem.photoCount = (mem.photoCount || 0) + photosDelta;
        mem.faceCount = (mem.faceCount || 0) + facesDelta;
        diskDb.events.set(eventId, mem);
        diskDb.save();
      }
    }
  }

  static async decrementPhotoAndFaceCount(eventId: string, facesDelta: number): Promise<void> {
    try {
      await prisma.event.update({
        where: { id: eventId },
        data: {
          photoCount: { decrement: 1 },
          faceCount: { decrement: facesDelta },
        },
      });
    } catch {
      const mem = diskDb.events.get(eventId);
      if (mem) {
        mem.photoCount = Math.max(0, (mem.photoCount || 0) - 1);
        mem.faceCount = Math.max(0, (mem.faceCount || 0) - facesDelta);
        diskDb.events.set(eventId, mem);
        diskDb.save();
      }
    }
  }

  static async deleteEvent(id: string): Promise<boolean> {
    // 1. Delete all photos & embeddings for this event
    await PhotoService.deletePhotosByEvent(id);

    // 2. Delete from Prisma if DB connected
    try {
      await prisma.event.delete({ where: { id } });
    } catch {
      // ignore
    }

    // 3. Delete from persistent diskDb store
    const existed = diskDb.events.has(id);
    diskDb.events.delete(id);
    diskDb.save();
    return existed;
  }

  static async getDashboardStats(photographerId?: string): Promise<PhotographerDashboardStats> {
    const allEvents = await this.getEvents(photographerId);
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
