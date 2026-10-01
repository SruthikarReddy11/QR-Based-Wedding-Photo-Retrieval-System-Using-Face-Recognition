import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { requireAdmin } from '../middleware/admin.js';

export const adminRouter = Router();

// Public PIN verification route
adminRouter.post('/verify-pin', AdminController.verifyPin);

// Protected routes - require Master Admin authorization
adminRouter.use(requireAdmin);

adminRouter.get('/stats', AdminController.getSystemStats);
adminRouter.get('/users', AdminController.listUsers);
adminRouter.delete('/users/:id', AdminController.deleteUser);
adminRouter.get('/events', AdminController.listAllEvents);
adminRouter.delete('/events/:id', AdminController.deleteEvent);
adminRouter.post('/purge-memory', AdminController.purgeMemory);
adminRouter.get('/backup', AdminController.backupDatabase);
adminRouter.post('/restore', AdminController.restoreDatabase);
