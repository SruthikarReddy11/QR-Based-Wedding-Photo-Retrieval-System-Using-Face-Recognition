import fs from 'fs';
import path from 'path';
import { prisma } from '../db/prisma.js';
import { ENV } from '../config/env.js';
import { diskDb, getProjectRoot } from '../db/diskDb.js';

export interface StoredPhoto {
  id: string;
  eventId: string;
  url: string;
  fileName: string;
  fileSizeBytes: number;
  width?: number;
  height?: number;
  status: 'INDEXED' | 'FAILED';
  faceCount: number;
  imageData?: string;
  createdAt: string;
}

export interface StoredFace {
  id: string;
  photoId: string;
  eventId: string;
  box: { x: number; y: number; width: number; height: number };
  boxAreaRatio: number;
  photoFaceCount: number;
  confidence: number;
  qualityScore?: number;
  blurScore?: number;
  faceWidth?: number;
  embedding: number[]; // 512D ArcFace vector
}

// Persistent disk-backed collections
export const photosStore = diskDb.photos;
export const facesStore = diskDb.faces;

export class PhotoService {
  static getUploadDir(eventId: string): string {
    const uploadDir = path.resolve(getProjectRoot(), 'uploads', eventId);
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
  }

  static async processAndIndexPhoto(eventId: string, file: Express.Multer.File): Promise<StoredPhoto> {
    const photoId = `photo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const uploadDir = this.getUploadDir(eventId);
    const ext = path.extname(file.originalname) || '.jpg';
    const finalFileName = `${photoId}${ext}`;
    const finalFilePath = path.join(uploadDir, finalFileName);

    // Save file to uploads directory (move from diskStorage temp or write buffer)
    if (file.path && fs.existsSync(file.path)) {
      fs.copyFileSync(file.path, finalFilePath);
      try {
        fs.unlinkSync(file.path);
      } catch {
        // ignore tmp unlink error
      }
    } else if (file.buffer) {
      fs.writeFileSync(finalFilePath, file.buffer);
    }

    const photoUrl = `/uploads/${eventId}/${finalFileName}`;
    let detectedFaces: any[] = [];
    let width = 0;
    let height = 0;

    // Call Python AI microservice to extract real 512D face embeddings (0-copy disk path first)
    try {
      const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
      let aiRes = await fetch(`${aiServiceUrl}/extract-embeddings-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: finalFilePath }),
      });

      // Fallback to multipart if path extraction not supported
      if (!aiRes.ok && fs.existsSync(finalFilePath)) {
        const fileBytes = fs.readFileSync(finalFilePath);
        const formData = new FormData();
        const blob = new Blob([fileBytes], { type: file.mimetype || 'image/jpeg' });
        formData.append('file', blob, file.originalname);
        aiRes = await fetch(`${aiServiceUrl}/extract-embeddings`, {
          method: 'POST',
          body: formData,
        });
      }

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        detectedFaces = aiData.faces || [];
        width = aiData.width || 0;
        height = aiData.height || 0;
        console.log(`[AI Worker] Processed photo ${finalFileName}: Detected ${detectedFaces.length} face(s) (512D ArcFace).`);
      } else {
        console.warn(`[AI Worker] Failed response: ${aiRes.statusText}`);
      }
    } catch (err: any) {
      console.error(`[AI Worker] Could not connect to AI microservice: ${err.message}`);
    }

    // Read file bytes into Base64 data URL for permanent database storage across server restarts
    let base64DataUrl = '';
    try {
      if (fs.existsSync(finalFilePath)) {
        const fileBuffer = fs.readFileSync(finalFilePath);
        const mime = file.mimetype || 'image/jpeg';
        base64DataUrl = `data:${mime};base64,${fileBuffer.toString('base64')}`;
      }
    } catch (readErr: any) {
      console.warn('[PhotoService] Failed reading photo bytes for Base64 storage:', readErr.message);
    }

    const storedPhoto: StoredPhoto = {
      id: photoId,
      eventId,
      url: photoUrl,
      fileName: file.originalname,
      fileSizeBytes: file.size,
      width,
      height,
      status: 'INDEXED',
      faceCount: detectedFaces.length,
      imageData: base64DataUrl || undefined,
      createdAt: new Date().toISOString(),
    };

    // 1. Save to persistent diskDb collections
    photosStore.set(photoId, storedPhoto);

    // Save extracted 512-d face embeddings and quality metrics for this event
    const eventFaces = facesStore.get(eventId) || [];
    for (const face of detectedFaces) {
      const q = face.quality || {};
      eventFaces.push({
        id: `face_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        photoId,
        eventId,
        box: face.box,
        boxAreaRatio: face.boxAreaRatio || 0.05,
        photoFaceCount: detectedFaces.length,
        confidence: face.confidence,
        qualityScore: q.quality_score ?? 70.0,
        blurScore: q.blur_score ?? 50.0,
        faceWidth: q.face_width ?? (face.box?.width || 100),
        embedding: face.embedding,
      });
    }
    facesStore.set(eventId, eventFaces);
    diskDb.save();

    // 2. Mirror to Prisma database if connected
    try {
      let prismaEventId = eventId;
      const pEv = await prisma.event.findFirst({
        where: { OR: [{ id: eventId }, { slug: eventId }] },
      });
      if (pEv) {
        prismaEventId = pEv.id;
        await prisma.photo.create({
          data: {
            id: photoId,
            eventId: prismaEventId,
            storageKeyOriginal: photoUrl,
            storageKeyPreview: base64DataUrl || null,
            imageData: base64DataUrl || null,
            fileName: file.originalname,
            fileSizeBytes: BigInt(file.size || 0),
            mimeType: file.mimetype || 'image/jpeg',
            width,
            height,
            status: 'INDEXED',
            faceCount: detectedFaces.length,
            processedAt: new Date(),
            photoFaces: {
              create: detectedFaces.map((face: any) => ({
                boundingBox: {
                  box: face.box,
                  boxAreaRatio: face.boxAreaRatio,
                  embedding: face.embedding,
                  quality: face.quality,
                },
                detectionConfidence: face.confidence || 0.9,
              })),
            },
          },
        });
      }
    } catch (prismaErr: any) {
      console.warn('[PhotoService] Prisma photo insert fallback to disk store:', prismaErr.message);
    }

    return storedPhoto;
  }

  static async getPhotosByEvent(eventId: string): Promise<StoredPhoto[]> {
    const photoMap = new Map<string, StoredPhoto>();

    // 1. Resolve all possible event IDs / slugs / aliases
    const matchingEventIds = new Set<string>([eventId]);
    let resolvedPrismaEventId: string | null = null;

    try {
      const pEvent = await prisma.event.findFirst({
        where: { OR: [{ id: eventId }, { slug: eventId }] },
      });
      if (pEvent) {
        matchingEventIds.add(pEvent.id);
        matchingEventIds.add(pEvent.slug);
        resolvedPrismaEventId = pEvent.id;
      }
    } catch {
      // ignore
    }

    for (const ev of diskDb.events.values()) {
      if (
        ev.id === eventId ||
        ev.slug === eventId ||
        (resolvedPrismaEventId && (ev.id === resolvedPrismaEventId || ev.slug === resolvedPrismaEventId)) ||
        matchingEventIds.has(ev.id) ||
        matchingEventIds.has(ev.slug)
      ) {
        matchingEventIds.add(ev.id);
        matchingEventIds.add(ev.slug);
      }
    }

    // 2. Fetch from Prisma database if available
    try {
      const prismaPhotos = await prisma.photo.findMany({
        where: {
          eventId: { in: Array.from(matchingEventIds) },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const p of prismaPhotos) {
        const photoUrl = p.storageKeyOriginal || `/uploads/${p.eventId}/${p.fileName}`;
        const imgData = p.imageData || p.storageKeyPreview || undefined;

        // Auto-rehydrate to physical disk if missing (e.g. after container restart)
        if (imgData && imgData.includes('base64,')) {
          try {
            const diskPath = path.resolve(getProjectRoot(), photoUrl.replace(/^\//, ''));
            if (!fs.existsSync(diskPath)) {
              const dir = path.dirname(diskPath);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              const rawBase64 = imgData.split('base64,')[1];
              fs.writeFileSync(diskPath, Buffer.from(rawBase64, 'base64'));
            }
          } catch (rehydrateErr) {
            console.warn('[PhotoService] Rehydration to disk failed:', rehydrateErr);
          }
        }

        photoMap.set(p.id, {
          id: p.id,
          eventId: p.eventId,
          url: photoUrl,
          fileName: p.fileName,
          fileSizeBytes: Number(p.fileSizeBytes || 0),
          width: p.width || 0,
          height: p.height || 0,
          status: (p.status as any) || 'INDEXED',
          faceCount: p.faceCount || 0,
          imageData: imgData,
          createdAt: p.createdAt.toISOString(),
        });
      }
    } catch {
      // Prisma not available
    }

    // 3. Merge from diskDb photosStore
    for (const photo of photosStore.values()) {
      if (matchingEventIds.has(photo.eventId)) {
        // Auto-rehydrate to physical disk if missing
        if (photo.imageData && photo.imageData.includes('base64,')) {
          try {
            const diskPath = path.resolve(getProjectRoot(), photo.url.replace(/^\//, ''));
            if (!fs.existsSync(diskPath)) {
              const dir = path.dirname(diskPath);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              const rawBase64 = photo.imageData.split('base64,')[1];
              fs.writeFileSync(diskPath, Buffer.from(rawBase64, 'base64'));
            }
          } catch (rehydrateErr) {
            console.warn('[PhotoService] Rehydration to disk failed:', rehydrateErr);
          }
        }

        if (!photoMap.has(photo.id)) {
          photoMap.set(photo.id, photo);
        } else {
          const existing = photoMap.get(photo.id)!;
          if (!existing.imageData && photo.imageData) {
            existing.imageData = photo.imageData;
          }
        }
      }
    }

    // 4. If only 1 event exists in diskDb, associate all disk photos to this event
    if (photoMap.size === 0 && (diskDb.events.size <= 1 || diskDb.photos.size <= 25)) {
      for (const photo of photosStore.values()) {
        photoMap.set(photo.id, {
          ...photo,
          eventId,
        });
      }
    }

    // 5. Physical disk scan fallback: if photoMap is still empty, scan uploads folder!
    if (photoMap.size === 0) {
      const candidates = Array.from(matchingEventIds);
      const uploadsDir = path.resolve(getProjectRoot(), 'uploads');
      if (fs.existsSync(uploadsDir)) {
        const subdirs = fs.readdirSync(uploadsDir);
        for (const sub of subdirs) {
          if (candidates.includes(sub) || (subdirs.length === 1 && sub.startsWith('event_'))) {
            const folderPath = path.join(uploadsDir, sub);
            if (fs.statSync(folderPath).isDirectory()) {
              const files = fs.readdirSync(folderPath).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
              for (const f of files) {
                const photoId = f.replace(/\.[^.]+$/, '');
                if (!photoMap.has(photoId)) {
                  const stat = fs.statSync(path.join(folderPath, f));
                  let scannedImageData: string | undefined = undefined;
                  try {
                    const buf = fs.readFileSync(path.join(folderPath, f));
                    const mime = f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
                    scannedImageData = `data:${mime};base64,${buf.toString('base64')}`;
                  } catch {}

                  const diskPhoto: StoredPhoto = {
                    id: photoId,
                    eventId,
                    url: `/uploads/${sub}/${f}`,
                    fileName: f,
                    fileSizeBytes: stat.size,
                    status: 'INDEXED',
                    faceCount: 1,
                    imageData: scannedImageData,
                    createdAt: stat.mtime.toISOString(),
                  };
                  photoMap.set(photoId, diskPhoto);
                  photosStore.set(photoId, diskPhoto);
                }
              }
            }
          }
        }
      }
    }

    return Array.from(photoMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  static async getAllPhotos(): Promise<StoredPhoto[]> {
    const photoMap = new Map<string, StoredPhoto>();

    try {
      const prismaPhotos = await prisma.photo.findMany({
        orderBy: { createdAt: 'desc' },
      });
      for (const p of prismaPhotos) {
        photoMap.set(p.id, {
          id: p.id,
          eventId: p.eventId,
          url: p.storageKeyOriginal || `/uploads/${p.eventId}/${p.fileName}`,
          fileName: p.fileName,
          fileSizeBytes: Number(p.fileSizeBytes || 0),
          width: p.width || 0,
          height: p.height || 0,
          status: (p.status as any) || 'INDEXED',
          faceCount: p.faceCount || 0,
          imageData: p.imageData || p.storageKeyPreview || undefined,
          createdAt: p.createdAt.toISOString(),
        });
      }
    } catch {}

    for (const photo of photosStore.values()) {
      if (!photoMap.has(photo.id)) {
        photoMap.set(photo.id, photo);
      } else {
        const existing = photoMap.get(photo.id)!;
        if (!existing.imageData && photo.imageData) {
          existing.imageData = photo.imageData;
        }
      }
    }

    return Array.from(photoMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  static async getPhotoById(photoId: string): Promise<StoredPhoto | null> {
    try {
      const p = await prisma.photo.findUnique({ where: { id: photoId } });
      if (p) {
        return {
          id: p.id,
          eventId: p.eventId,
          url: p.storageKeyOriginal || `/uploads/${p.eventId}/${p.fileName}`,
          fileName: p.fileName,
          fileSizeBytes: Number(p.fileSizeBytes || 0),
          width: p.width || 0,
          height: p.height || 0,
          status: (p.status as any) || 'INDEXED',
          faceCount: p.faceCount || 0,
          imageData: p.imageData || p.storageKeyPreview || undefined,
          createdAt: p.createdAt.toISOString(),
        };
      }
    } catch {}
    return photosStore.get(photoId) || null;
  }

  static async deletePhoto(eventId: string, photoId: string): Promise<{ deleted: boolean; facesRemoved: number }> {
    const photo = await this.getPhotoById(photoId);
    let facesRemoved = 0;

    if (photo) {
      // Delete physical file
      const filePath = path.resolve(process.cwd(), photo.url.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.warn(`Could not delete file ${filePath}:`, err);
        }
      }
    }

    // Remove face embeddings from facesStore
    const eventFaces = facesStore.get(eventId) || [];
    const remainingFaces = eventFaces.filter((f) => f.photoId !== photoId);
    facesRemoved = eventFaces.length - remainingFaces.length;
    facesStore.set(eventId, remainingFaces);

    // Delete from photosStore
    const deletedFromDisk = photosStore.delete(photoId);
    diskDb.save();

    // Also delete from Prisma if DB connected
    let deletedFromPrisma = false;
    try {
      await prisma.photo.delete({ where: { id: photoId } });
      deletedFromPrisma = true;
    } catch {
      // ignore
    }

    return { deleted: Boolean(deletedFromDisk || deletedFromPrisma || photo), facesRemoved };
  }

  static async deletePhotosByEvent(eventId: string): Promise<void> {
    // Delete all files in uploads/eventId
    const uploadDir = path.resolve(getProjectRoot(), 'uploads', eventId);
    if (fs.existsSync(uploadDir)) {
      try {
        fs.rmSync(uploadDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`Could not delete directory ${uploadDir}:`, err);
      }
    }

    // Remove from stores
    for (const [photoId, photo] of photosStore.entries()) {
      if (photo.eventId === eventId) {
        photosStore.delete(photoId);
      }
    }
    facesStore.delete(eventId);
    diskDb.save();

    // Also delete from Prisma
    try {
      await prisma.photo.deleteMany({ where: { eventId } });
    } catch {
      // ignore
    }
  }

  static async searchSelfieInEvent(eventId: string, selfieBase64?: string, selfieBase64List?: string[]) {
    // Collect all candidate faces from both facesStore and Prisma
    const candidateFaces: StoredFace[] = [];
    const seenFaceIds = new Set<string>();

    // 1. Resolve matching event IDs
    const matchingIds = new Set<string>([eventId]);
    try {
      const pEv = await prisma.event.findFirst({
        where: { OR: [{ id: eventId }, { slug: eventId }] },
      });
      if (pEv) {
        matchingIds.add(pEv.id);
        matchingIds.add(pEv.slug);
      }
    } catch {}
    for (const ev of diskDb.events.values()) {
      if (matchingIds.has(ev.id) || matchingIds.has(ev.slug)) {
        matchingIds.add(ev.id);
        matchingIds.add(ev.slug);
      }
    }

    // 2. Fetch from facesStore
    for (const id of matchingIds) {
      const faces = facesStore.get(id) || [];
      for (const f of faces) {
        if (!seenFaceIds.has(f.id)) {
          seenFaceIds.add(f.id);
          candidateFaces.push(f);
        }
      }
    }

    // If candidateFaces empty, check all stored faces in diskDb if only 1 event exists
    if (candidateFaces.length === 0 && facesStore.size >= 1) {
      for (const faces of facesStore.values()) {
        for (const f of faces) {
          if (!seenFaceIds.has(f.id)) {
            seenFaceIds.add(f.id);
            candidateFaces.push(f);
          }
        }
      }
    }

    // 3. Fetch from Prisma photoFace if available
    try {
      const pFaces = await prisma.photoFace.findMany({
        where: {
          eventId: { in: Array.from(matchingIds) },
        },
      });
      for (const pf of pFaces) {
        if (!seenFaceIds.has(pf.id)) {
          const bb = (pf.boundingBox as any) || {};
          if (bb.embedding && Array.isArray(bb.embedding)) {
            seenFaceIds.add(pf.id);
            candidateFaces.push({
              id: pf.id,
              photoId: pf.photoId,
              eventId: pf.eventId,
              box: bb.box || { x: 0, y: 0, width: 100, height: 100 },
              boxAreaRatio: bb.boxAreaRatio || 0.05,
              photoFaceCount: 1,
              confidence: pf.detectionConfidence || 0.9,
              qualityScore: bb.quality?.quality_score ?? 70.0,
              blurScore: bb.quality?.blur_score ?? 50.0,
              embedding: bb.embedding,
            });
          }
        }
      }
    } catch {}

    if (candidateFaces.length === 0) {
      return {
        selfieValid: true,
        faceDetected: true,
        matchesFound: 0,
        highConfidenceCount: 0,
        suggestedCount: 0,
        matches: [],
        message: 'No photos with faces have been uploaded to this wedding yet. Please check back later!',
      };
    }

    const startTime = Date.now();

    // Call Python AI matcher to compare selfie embedding strictly against candidate faces from this event
    const aiRes = await fetch(`${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/match-selfie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selfieBase64,
        selfieBase64List,
        candidates: candidateFaces.map((f) => ({
          photoId: f.photoId,
          embedding: f.embedding,
          boxAreaRatio: f.boxAreaRatio,
          photoFaceCount: f.photoFaceCount,
          qualityScore: f.qualityScore ?? 70.0,
          blurScore: f.blurScore ?? 50.0,
          faceWidth: f.faceWidth ?? 100,
        })),
        highThreshold: 0.45,
        suggestedThreshold: 0.34,
      }),
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      throw new Error(`AI matching error: ${errorText}`);
    }

    const matchResult = await aiRes.json();
    const executionTimeMs = Date.now() - startTime;

    if (!matchResult.selfieValid) {
      return {
        selfieValid: false,
        error: matchResult.error || 'No face detected in selfie.',
        matchesFound: 0,
        highConfidenceCount: 0,
        suggestedCount: 0,
        matches: [],
        executionTimeMs,
      };
    }

    // Map matched photoIds to real photo objects with URLs and tier info
    const matchedItems = [];
    for (const m of matchResult.matches) {
      const photo = await this.getPhotoById(m.photoId);
      if (photo) {
        matchedItems.push({
          photoId: photo.id,
          url: photo.url,
          imageData: photo.imageData,
          fileName: photo.fileName,
          similarityScore: m.similarityScore,
          matchTier: m.matchTier || (m.similarityScore >= 0.45 ? 'high_confidence' : 'suggested'),
          compositeRankScore: m.compositeRankScore ?? m.similarityScore,
          category: m.category,
        });
      }
    }

    return {
      selfieValid: true,
      faceDetected: true,
      selfieConfidence: matchResult.selfieConfidence,
      queryFramesProcessed: matchResult.queryFramesProcessed || 1,
      matchesFound: matchedItems.length,
      highConfidenceCount: matchResult.highConfidenceCount || matchedItems.filter(m => m.matchTier === 'high_confidence').length,
      suggestedCount: matchResult.suggestedCount || matchedItems.filter(m => m.matchTier === 'suggested').length,
      matches: matchedItems,
      executionTimeMs,
    };
  }
}
