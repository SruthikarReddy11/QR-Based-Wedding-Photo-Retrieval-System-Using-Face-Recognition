export type UserRole = 'ADMIN' | 'PHOTOGRAPHER';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface PhotographerProfile {
  id: string;
  userId: string;
  studioName: string;
  websiteUrl?: string;
  watermarkUrl?: string;
  storageUsedBytes: number;
}

export type EventStatus = 'DRAFT' | 'ACTIVE' | 'PROCESSING' | 'COMPLETED' | 'ARCHIVED';

export interface WeddingEvent {
  id: string;
  photographerId: string;
  title: string;
  slug: string;
  coupleNames: string;
  eventDate: string;
  venueCity: string;
  venueName?: string | null;
  description?: string | null;
  coverPhotoUrl?: string | null;
  isActive: boolean;
  allowFullGalleryView: boolean;
  allowGuestDownloads: boolean;
  photoCount: number;
  faceCount: number;
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
}

export type PhotoStatus = 'PENDING_UPLOAD' | 'UPLOADED' | 'PROCESSING' | 'INDEXED' | 'FAILED';

export interface Photo {
  id: string;
  eventId: string;
  storageKeyOriginal: string;
  storageKeyPreview?: string;
  storageKeyThumb?: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  width?: number;
  height?: number;
  status: PhotoStatus;
  faceCount: number;
  errorMessage?: string;
  uploadedAt?: string;
  processedAt?: string;
  createdAt: string;
}

export interface PhotoFace {
  id: string;
  photoId: string;
  eventId: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  detectionConfidence: number;
}

export interface RegisterDto {
  email: string;
  password: string;
  fullName: string;
  studioName: string;
  phoneNumber?: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface CreateEventDto {
  title: string;
  coupleNames: string;
  eventDate: string;
  venueCity: string;
  venueName?: string;
  description?: string;
  slug?: string;
  coverPhotoUrl?: string;
  allowFullGalleryView?: boolean;
  allowGuestDownloads?: boolean;
}

export interface UpdateEventDto extends Partial<CreateEventDto> {
  isActive?: boolean;
}

export interface GuestSearchRequest {
  eventId: string;
  selfieBase64?: string;
}

export interface PhotoMatch {
  photoId: string;
  previewUrl: string;
  originalUrl?: string;
  similarityScore: number;
  category: 'portrait' | 'group' | 'candid';
}

export interface GuestSearchResponse {
  searchId: string;
  eventId: string;
  matchesFound: number;
  matches: PhotoMatch[];
  executionTimeMs: number;
}

export interface PhotographerDashboardStats {
  totalEvents: number;
  totalPhotos: number;
  facesDetected: number;
  totalSearches: number;
  storageUsedBytes: number;
}
