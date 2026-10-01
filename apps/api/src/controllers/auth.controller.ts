import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { AuthRequest } from '../middleware/auth.js';

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, fullName, studioName, phoneNumber } = req.body;

      if (!email || !password || !fullName || !studioName) {
        res.status(400).json({ error: 'Email, password, full name, and studio name are required.' });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        return;
      }

      const result = await AuthService.register({
        email,
        password,
        fullName,
        studioName,
        phoneNumber,
      });

      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message || 'Registration failed.' });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const result = await AuthService.login({ email, password });
      res.status(200).json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message || 'Login failed.' });
    }
  }

  static async me(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Not authenticated.' });
        return;
      }

      const user = await AuthService.getMe(req.user.userId);
      res.status(200).json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch user profile.' });
    }
  }
}
