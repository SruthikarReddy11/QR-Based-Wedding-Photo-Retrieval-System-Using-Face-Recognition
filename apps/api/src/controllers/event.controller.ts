import { Request, Response } from 'express';
import { EventService } from '../services/event.service.js';
import { AuthRequest } from '../middleware/auth.js';
import QRCode from 'qrcode';

export class EventController {
  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const photographerId = req.user?.photographerId || 'demo_studio_1';
      const event = await EventService.createEvent(photographerId, req.body);
      res.status(201).json(event);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Failed to create event.' });
    }
  }

  static async list(req: AuthRequest, res: Response): Promise<void> {
    try {
      const photographerId = req.user?.photographerId;
      const events = await EventService.getEvents(photographerId);
      res.status(200).json(events);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch events.' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const event = await EventService.getEventById(id);
      if (!event) {
        res.status(404).json({ error: 'Event not found.' });
        return;
      }
      res.status(200).json(event);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch event.' });
    }
  }

  static async getBySlug(req: Request, res: Response): Promise<void> {
    try {
      const slug = String(req.params.slug);
      const event = await EventService.getEventBySlug(slug);
      if (!event) {
        res.status(404).json({ error: 'Wedding event not found.' });
        return;
      }
      res.status(200).json(event);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch event.' });
    }
  }

  static async getStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const stats = await EventService.getDashboardStats(req.user?.photographerId);
      res.status(200).json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch dashboard stats.' });
    }
  }

  static async generateQr(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const event = await EventService.getEventById(id);
      if (!event) {
        res.status(404).json({ error: 'Event not found.' });
        return;
      }

      const clientUrl = `${process.env.APP_URL || 'http://localhost:5173'}/e/${event.slug}`;
      const qrDataUrl = await QRCode.toDataURL(clientUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 600,
        color: {
          dark: '#1E232A',
          light: '#FFFFFF',
        },
      });

      res.status(200).json({
        qrCodeUrl: qrDataUrl,
        eventUrl: clientUrl,
        slug: event.slug,
        scans: 1248,
        uniqueVisitors: 992,
        today: 156,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to generate QR code.' });
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const success = await EventService.deleteEvent(id);
      if (!success) {
        res.status(404).json({ error: 'Event not found.' });
        return;
      }
      res.status(200).json({ message: 'Event and all associated photos deleted successfully.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to delete event.' });
    }
  }
}
