import fs from 'fs';
import path from 'path';
import { prisma } from '../db/prisma.js';
import { ENV } from '../config/env.js';
import { diskDb } from '../db/diskDb.js';

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
    const uploadDir = path.resolve(process.cwd(), 'uploads', eventId);
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

    // Write file to uploads directory
    fs.writeFileSync(finalFilePath, file.buffer);

    const photoUrl = `/uploads/${eventId}/${finalFileName}`;
    let detectedFaces: any[] = [];
    let width = 0;
    let height = 0;

    // Call Python AI microservice to extract real 512D face embeddings and quality metrics
    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
      formData.append('file', blob, file.originalname);

      const aiRes = await fetch(`${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/extract-embeddings`, {
        method: 'POST',
        body: formData,
      });

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
      createdAt: new Date().toISOString(),
    };

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

    return storedPhoto;
  }

  static async getPhotosByEvent(eventId: string): Promise<StoredPhoto[]> {
    const results: StoredPhoto[] = [];
    for (const photo of photosStore.values()) {
      if (photo.eventId === eventId) {
        results.push(photo);
      }
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  static async getAllPhotos(): Promise<StoredPhoto[]> {
    const all = Array.from(photosStore.values());
    return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  static async getPhotoById(photoId: string): Promise<StoredPhoto | null> {
    return photosStore.get(photoId) || null;
  }

  static async deletePhoto(eventId: string, photoId: string): Promise<{ deleted: boolean; facesRemoved: number }> {
    const photo = photosStore.get(photoId);
    if (!photo || photo.eventId !== eventId) {
      return { deleted: false, facesRemoved: 0 };
    }

    // Delete physical file
    const filePath = path.resolve(process.cwd(), photo.url.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`Could not delete file ${filePath}:`, err);
      }
    }

    // Remove face embeddings from facesStore
    const eventFaces = facesStore.get(eventId) || [];
    const remainingFaces = eventFaces.filter((f) => f.photoId !== photoId);
    const facesRemoved = eventFaces.length - remainingFaces.length;
    facesStore.set(eventId, remainingFaces);

    // Delete from photosStore
    photosStore.delete(photoId);
    diskDb.save();

    // Also delete from Prisma if DB connected
    try {
      await prisma.photo.delete({ where: { id: photoId } });
    } catch {
      // ignore
    }

    return { deleted: true, facesRemoved };
  }

  static async deletePhotosByEvent(eventId: string): Promise<void> {
    // Delete all files in uploads/eventId
    const uploadDir = path.resolve(process.cwd(), 'uploads', eventId);
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
  }

  static async searchSelfieInEvent(eventId: string, selfieBase64?: string, selfieBase64List?: string[]) {
    const candidateFaces = facesStore.get(eventId) || [];

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
      const photo = photosStore.get(m.photoId);
      if (photo) {
        matchedItems.push({
          photoId: photo.id,
          url: photo.url,
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
