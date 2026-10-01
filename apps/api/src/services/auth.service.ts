import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import { ENV } from '../config/env.js';
import { diskDb } from '../db/diskDb.js';
import { RegisterDto, LoginDto, AuthResponse } from '@wednap/shared';

export class AuthService {
  static async register(dto: RegisterDto): Promise<AuthResponse> {
    const existingEmail = dto.email.toLowerCase().trim();

    try {
      // Try Prisma database first
      const existingUser = await prisma.user.findUnique({
        where: { email: existingEmail },
      });

      if (existingUser) {
        throw new Error('An account with this email already exists.');
      }

      const passwordHash = await bcrypt.hash(dto.password, 12);

      const newUser = await prisma.user.create({
        data: {
          email: existingEmail,
          passwordHash,
          fullName: dto.fullName,
          phoneNumber: dto.phoneNumber,
          role: 'PHOTOGRAPHER',
          photographer: {
            create: {
              studioName: dto.studioName,
            },
          },
        },
        include: {
          photographer: true,
        },
      });

      const token = jwt.sign(
        {
          userId: newUser.id,
          email: newUser.email,
          role: newUser.role,
          photographerId: newUser.photographer?.id,
        },
        ENV.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return {
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
          phoneNumber: newUser.phoneNumber || undefined,
          role: newUser.role,
          createdAt: newUser.createdAt.toISOString(),
          updatedAt: newUser.updatedAt.toISOString(),
        },
        token,
      };
    } catch (dbError: any) {
      // If DB error is not a duplicate user error, handle fallback for local dev
      if (dbError.message?.includes('already exists')) {
        throw dbError;
      }

      console.warn('[AuthService] Prisma connection fallback to persistent disk store:', dbError.message);

      if (diskDb.users.has(existingEmail)) {
        throw new Error('An account with this email already exists.');
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);
      const userId = `user_${Date.now()}`;
      const photographerId = `photo_${Date.now()}`;

      const user = {
        id: userId,
        email: existingEmail,
        passwordHash,
        fullName: dto.fullName,
        phoneNumber: dto.phoneNumber,
        role: 'PHOTOGRAPHER' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      diskDb.users.set(existingEmail, user);
      diskDb.photographers.set(photographerId, {
        id: photographerId,
        userId,
        studioName: dto.studioName,
      });
      diskDb.save();

      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          photographerId,
        },
        ENV.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        token,
      };
    }
  }

  static async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase().trim();

    try {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { photographer: true },
      });

      if (!user) {
        throw new Error('Invalid email or password.');
      }

      const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password.');
      }

      const token = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
          photographerId: user.photographer?.id,
        },
        ENV.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phoneNumber: user.phoneNumber || undefined,
          role: user.role,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
        token,
      };
    } catch (dbError: any) {
      if (dbError.message === 'Invalid email or password.') {
        throw dbError;
      }

      console.warn('[AuthService] Prisma connection fallback to persistent disk store login:', dbError.message);

      const memUser = diskDb.users.get(email);
      if (!memUser) {
        throw new Error('Invalid email or password.');
      }

      const isPasswordValid = await bcrypt.compare(dto.password, memUser.passwordHash);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password.');
      }

      // Look up photographer profile for this user
      let photographer = Array.from(diskDb.photographers.values()).find(
        (p: any) => p.userId === memUser.id
      );

      let photographerId = photographer?.id;
      if (!photographerId) {
        photographerId = `photo_${memUser.id}`;
        diskDb.photographers.set(photographerId, {
          id: photographerId,
          userId: memUser.id,
          studioName: memUser.fullName ? `${memUser.fullName}'s Studio` : 'Photography Studio',
        });
        diskDb.save();
      }

      const token = jwt.sign(
        {
          userId: memUser.id,
          email: memUser.email,
          role: memUser.role,
          photographerId,
        },
        ENV.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return {
        user: {
          id: memUser.id,
          email: memUser.email,
          fullName: memUser.fullName,
          phoneNumber: memUser.phoneNumber,
          role: memUser.role,
          createdAt: memUser.createdAt,
          updatedAt: memUser.updatedAt,
        },
        token,
      };
    }
  }

  static async getMe(userId: string): Promise<any> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { photographer: true },
      });

      if (!user) throw new Error('User not found.');

      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        photographer: user.photographer,
        createdAt: user.createdAt.toISOString(),
      };
    } catch {
      for (const u of diskDb.users.values()) {
        if (u.id === userId) {
          const photographer = Array.from(diskDb.photographers.values()).find(
            (p: any) => p.userId === u.id
          );
          return {
            id: u.id,
            email: u.email,
            fullName: u.fullName,
            phoneNumber: u.phoneNumber,
            role: u.role,
            photographer: photographer || {
              id: `photo_${u.id}`,
              studioName: `${u.fullName || 'Studio'}'s Photography`,
            },
            createdAt: u.createdAt,
          };
        }
      }
      throw new Error('User not found.');
    }
  }
}
