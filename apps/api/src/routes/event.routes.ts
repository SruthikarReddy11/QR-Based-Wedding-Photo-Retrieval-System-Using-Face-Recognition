import { Router } from 'express';
import multer from 'multer';
import { EventController } from '../controllers/event.controller.js';
import { PhotoController } from '../controllers/photo.controller.js';
import { requireAuth } from '../middleware/auth.js';

import path from 'path';
import fs from 'fs';

export const eventRouter = Router();

const tempUploadDir = path.resolve(process.cwd(), 'uploads', 'tmp');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `tmp_${unique}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 35 * 1024 * 1024 } });

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
