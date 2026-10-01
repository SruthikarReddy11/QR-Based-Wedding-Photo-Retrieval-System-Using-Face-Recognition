import { Request, Response } from 'express';
import { PhotoService } from '../services/photo.service.js';
import { EventService } from '../services/event.service.js';
import { AuthRequest } from '../middleware/auth.js';

export class PhotoController {
  static async upload(req: AuthRequest, res: Response): Promise<void> {
    try {
      const eventId = String(req.params.id);
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({ error: 'No files uploaded.' });
        return;
      }

      const event = await EventService.getEventById(eventId);
      if (!event) {
        res.status(404).json({ error: 'Event not found.' });
        return;
      }

      const processedPhotos = [];
      let totalFacesAdded = 0;

      for (const file of files) {
        const photo = await PhotoService.processAndIndexPhoto(eventId, file);
        processedPhotos.push(photo);
        totalFacesAdded += photo.faceCount;
      }

      // Update event counters
      await EventService.incrementPhotoAndFaceCount(eventId, processedPhotos.length, totalFacesAdded);

      res.status(201).json({
        message: `Successfully uploaded and processed ${processedPhotos.length} photo(s).`,
        photos: processedPhotos,
        totalFacesDetected: totalFacesAdded,
      });
    } catch (error: any) {
      console.error('[Upload Error]', error);
      res.status(500).json({ error: error.message || 'Failed to upload and process photos.' });
    }
  }

  static async listByEvent(req: Request, res: Response): Promise<void> {
    try {
      const eventId = String(req.params.id);
      const photos = await PhotoService.getPhotosByEvent(eventId);
      res.status(200).json(photos);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch photos.' });
    }
  }

  static async listAll(_req: Request, res: Response): Promise<void> {
    try {
      const photos = await PhotoService.getAllPhotos();
      res.status(200).json(photos);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch all photos.' });
    }
  }

  static async guestSearch(req: Request, res: Response): Promise<void> {
    try {
      const slug = String(req.params.slug);
      const { selfieBase64, selfieBase64List } = req.body;

      if (!selfieBase64 && (!selfieBase64List || selfieBase64List.length === 0)) {
        res.status(400).json({ error: 'Selfie image is required.' });
        return;
      }

      const event = await EventService.getEventBySlug(slug);
      if (!event) {
        res.status(404).json({ error: 'Wedding event not found.' });
        return;
      }

      const result = await PhotoService.searchSelfieInEvent(event.id, selfieBase64, selfieBase64List);
      res.status(200).json(result);
    } catch (error: any) {
      console.error('[Guest Search Error]', error);
      res.status(500).json({ error: error.message || 'Search failed.' });
    }
  }

  static async deletePhoto(req: Request, res: Response): Promise<void> {
    try {
      const eventId = String(req.params.id);
      const photoId = String(req.params.photoId);

      const result = await PhotoService.deletePhoto(eventId, photoId);
      if (!result.deleted) {
        res.status(404).json({ error: 'Photo not found.' });
        return;
      }

      await EventService.decrementPhotoAndFaceCount(eventId, result.facesRemoved);

      res.status(200).json({
        message: 'Photo deleted successfully.',
        facesRemoved: result.facesRemoved,
      });
    } catch (error: any) {
      console.error('[Delete Photo Error]', error);
      res.status(500).json({ error: error.message || 'Failed to delete photo.' });
    }
  }
}
