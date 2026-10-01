import { Router } from 'express';
import { EventController } from '../controllers/event.controller.js';
import { PhotoController } from '../controllers/photo.controller.js';

export const publicRouter = Router();

// Guest public access (No authentication required)
publicRouter.get('/events/:slug', EventController.getBySlug);
publicRouter.post('/events/:slug/search', PhotoController.guestSearch);
