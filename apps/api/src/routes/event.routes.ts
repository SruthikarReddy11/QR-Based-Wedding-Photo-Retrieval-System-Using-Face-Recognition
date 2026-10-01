import { Router } from 'express';
import multer from 'multer';
import { EventController } from '../controllers/event.controller.js';
import { PhotoController } from '../controllers/photo.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const eventRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

eventRouter.use(requireAuth);

eventRouter.post('/', EventController.create);
eventRouter.get('/', EventController.list);
eventRouter.get('/stats', EventController.getStats);
eventRouter.get('/photos/all', PhotoController.listAll);
eventRouter.get('/:id', EventController.getById);
eventRouter.get('/:id/qr', EventController.generateQr);

eventRouter.post('/:id/photos', upload.array('photos', 100), PhotoController.upload);
eventRouter.get('/:id/photos', PhotoController.listByEvent);
eventRouter.delete('/:id/photos/:photoId', PhotoController.deletePhoto);
eventRouter.delete('/:id', EventController.delete);
