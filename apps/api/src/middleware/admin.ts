import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';

export interface AdminRequest extends Request {
  adminUser?: any;
}

export const requireAdmin = (req: AdminRequest, res: Response, next: NextFunction): void => {
  // 1. Check direct admin PIN header
  const pinHeader = req.headers['x-admin-pin'];
  if (pinHeader === '2006') {
    req.adminUser = { role: 'ADMIN', name: 'Master Administrator' };
    return next();
  }

  // 2. Check JWT Bearer token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Admin authorization required. Please provide valid PIN or Admin token.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded: any = jwt.verify(token, ENV.JWT_SECRET);
    if (decoded.role !== 'ADMIN' && !decoded.isAdmin) {
      res.status(403).json({ error: 'Access denied. Master Administrator privileges required.' });
      return;
    }
    req.adminUser = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired admin session. Re-enter PIN 2006.' });
  }
};
