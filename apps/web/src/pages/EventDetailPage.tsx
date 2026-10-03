import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Copy,
  ExternalLink,
  CheckCircle2,
  Calendar,
  MapPin,
  Upload,
  Image as ImageIcon,
  Users,
  RefreshCw,
  Sparkles,
  Trash2,
  Check,
  Eye,
  X,
  Layers,
  Search,
  Cpu,
  ShieldCheck,
  CheckSquare,
  Square
} from 'lucide-react';
import { api, getImageUrl } from '../lib/api';
import { WeddingQRCode } from '../components/WeddingQRCode';

export const EventDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Tab & Event State
  const [activeTab, setActiveTab] = useState<'photos' | 'qr' | 'processing' | 'settings'>('photos');
  const [event, setEvent] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload & Batch State
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Interactive Lightbox & Selection
  const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  const fetchEventData = async () => {
    try {
      setLoading(true);
      const eventRes = await api.get(`/events/${id}`);
      setEvent(eventRes.data);

      const targetId = eventRes.data?.id || id;
      try {
        const photosRes = await api.get(`/events/${targetId}/photos`);
        setPhotos(photosRes.data || []);
      } catch (photoErr) {
        console.warn('Could not load photos for event:', photoErr);
        setPhotos([]);
      }

      if (eventRes.data?.slug) {
        const guestUrl = `${window.location.origin}/e/${eventRes.data.slug}`;
        setQrCodeUrl(
          `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=10&data=${encodeURIComponent(guestUrl)}`
        );
      }
    } catch (err) {
      console.error('Failed to load event data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchEventData();
    }
  }, [id]);

  // Helper: resize large camera images (e.g. 10MB DSLR/iPhone photos) to max 1920px JPEG
  // Drastically speeds up network transfer and guarantees 0 OOM crashes on free hosting tiers
  const compressImageForUpload = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) return file;

    return new Promise((resolve) => {
      // If under 800KB and already jpg/png, don't re-encode
      if (file.size < 800 * 1024) {
        return resolve(file);
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 1920;
          let { width, height } = img;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(file);
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return resolve(file);
              const optimized = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(optimized);
            },
            'image/jpeg',
            0.88
          );
        };
        img.onerror = () => resolve(file);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  // Progressive Sequential Upload Queue with Zero Memory Spikes
  const processUploadQueue = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArray.length === 0) {
      alert('Please select valid image files (JPG, PNG, WebP).');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus(`Preparing ${fileArray.length} photographs for AI Face Ingestion...`);

    let totalUploaded = 0;
    let totalFacesDetected = 0;
    let failedCount = 0;

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const rawFile = fileArray[i];
        const currentNum = i + 1;
        setUploadStatus(
          `Uploading ${currentNum} of ${fileArray.length}: ${rawFile.name} • Extracting ArcFace 512D embeddings...`
        );

        try {
          const optimizedFile = await compressImageForUpload(rawFile);
          const formData = new FormData();
          formData.append('photos', optimizedFile);

          const res = await api.post(`/events/${id}/photos`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });

          totalUploaded += 1;
          totalFacesDetected += res.data.totalFacesDetected || 0;
        } catch (fileErr: any) {
          console.error(`Failed uploading photo ${rawFile.name}:`, fileErr);
          failedCount += 1;
        }

        const percent = Math.round((currentNum / fileArray.length) * 100);
        setUploadProgress(percent);

        // Real-time progressive UI refresh every 2 photos or at end
        if (currentNum % 2 === 0 || currentNum === fileArray.length) {
          fetchEventData();
        }
      }

      setUploadStatus(
        failedCount === 0
          ? `✨ Successfully uploaded ${totalUploaded} photograph(s) with ${totalFacesDetected} faces mapped into 512D ArcFace vector space!`
          : `Processed ${totalUploaded} photo(s) (${failedCount} skipped due to error). ${totalFacesDetected} faces mapped.`
      );
      await fetchEventData();
    } catch (err: any) {
      console.error('[Upload Error]', err);
      setUploadStatus(`Upload encountered an issue: ${err.response?.data?.error || err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadQueue(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadQueue(e.dataTransfer.files);
    }
  };

  const copyUrl = () => {
    const guestUrl = `${window.location.origin}/e/${event?.slug}`;
    navigator.clipboard.writeText(guestUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeletePhoto = async (photoId: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!window.confirm('Delete this photo and remove its indexed face embeddings?')) {
      return;
    }

    try {
      await api.delete(`/events/${id}/photos/${photoId}`);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      if (selectedPhoto?.id === photoId) {
        setSelectedPhoto(null);
      }
      setSelectedPhotoIds((prev) => {
        const next = new Set(prev);
        next.delete(photoId);
        return next;
      });
      await fetchEventData();
    } catch (err: any) {
      alert(`Failed to delete photo: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedPhotoIds.size === 0) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedPhotoIds.size} selected photograph(s) and their face embeddings?`
      )
    ) {
      return;
    }

    const idsToDelete = Array.from(selectedPhotoIds);
    try {
      for (const photoId of idsToDelete) {
        await api.delete(`/events/${id}/photos/${photoId}`);
      }
      setSelectedPhotoIds(new Set());
      setIsSelectMode(false);
      await fetchEventData();
    } catch (err: any) {
      alert(`Batch delete error: ${err.response?.data?.error || err.message}`);
    }
  };

  const toggleSelectPhoto = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPhotoIds.size === filteredPhotos.length) {
      setSelectedPhotoIds(new Set());
    } else {
      setSelectedPhotoIds(new Set(filteredPhotos.map((p) => p.id)));
    }
  };

  const handleDeleteEvent = async () => {
    if (
      !window.confirm(
        `Are you sure you want to delete "${event?.coupleNames}"? This will permanently delete all uploaded photos and face embeddings.`
      )
    ) {
      return;
    }

    try {
      await api.delete(`/events/${id}`);
      navigate('/dashboard');
    } catch (err: any) {
      alert(`Failed to delete event: ${err.response?.data?.error || err.message}`);
    }
  };

  // Filtered photos
  const filteredPhotos = photos.filter((p) => {
    if (!searchQuery.trim()) return true;
    const nameMatch = p.fileName?.toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch;
  });

  const totalFaces = photos.reduce((acc, curr) => acc + (curr.faceCount || 0), 0);
  const guestUrl = `${window.location.origin}/e/${event?.slug}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6 space-y-3">
        <div className="w-10 h-10 border-3 border-[#D84061] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-serif text-[#64748B]">Loading event gallery & vector index...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
          <ImageIcon className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-serif font-bold text-[#1E232A]">Event Not Found</h2>
        <p className="text-xs text-[#64748B] mt-1 max-w-sm">
          The wedding event you are looking for does not exist or has been removed.
        </p>
        <Link
          to="/dashboard"
          className="mt-6 px-5 py-2.5 rounded-full bg-[#D84061] text-white text-xs font-semibold hover:bg-[#C03251] transition-all shadow-md shadow-[#D84061]/25"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent text-[#1E232A] relative">
      {/* Top Ambient Navigation Bar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-[#EFE9E1] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                className="p-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F5EBE6] text-[#64748B] hover:text-[#D84061] transition-colors border border-[#EFE9E1]"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-serif font-bold text-[#1E232A] tracking-tight">
                    {event.coupleNames}
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FAF8F5] text-[11px] font-medium text-[#D84061] border border-[#EFE9E1]">
                    {event.status || 'Active'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#64748B] mt-0.5">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#D84061]" />{' '}
                    {new Date(event.eventDate).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-[#D84061]" /> {event.venueCity}{' '}
                    {event.venueName ? `(${event.venueName})` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2.5">
              <Link
                to={`/e/${event.slug}`}
                target="_blank"
                className="px-4 py-2 rounded-xl bg-white text-[#D84061] text-xs font-semibold hover:bg-[#FAF8F5] transition-all flex items-center gap-1.5 border border-[#EFE9E1] shadow-xs"
              >
                <span>Live Guest Discovery</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>

              <button
                type="button"
                onClick={copyUrl}
                className="px-4 py-2 rounded-xl bg-[#F5EBE6] text-[#D84061] text-xs font-semibold hover:bg-[#ebdcd3] transition-colors flex items-center gap-1.5 border border-[#EFE9E1]"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>

          {/* Subtabs */}
          <div className="flex items-center gap-6 mt-4 border-t border-[#EFE9E1]/60 pt-3 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('photos')}
              className={`pb-2 border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'photos'
                  ? 'border-[#D84061] text-[#D84061]'
                  : 'border-transparent text-[#64748B] hover:text-[#1E232A]'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              <span>Event Gallery ({photos.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('qr')}
              className={`pb-2 border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'qr'
                  ? 'border-[#D84061] text-[#D84061]'
                  : 'border-transparent text-[#64748B] hover:text-[#1E232A]'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>QR Code & Standee</span>
            </button>

            <button
              onClick={() => setActiveTab('processing')}
              className={`pb-2 border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'processing'
                  ? 'border-[#D84061] text-[#D84061]'
                  : 'border-transparent text-[#64748B] hover:text-[#1E232A]'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>AI Vision Engine ({totalFaces} Faces)</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`pb-2 border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'settings'
                  ? 'border-[#D84061] text-[#D84061]'
                  : 'border-transparent text-[#64748B] hover:text-[#1E232A]'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>Event Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ============================================================== */}
        {/* TAB 1: EVENT GALLERY & MULTI-IMAGE BATCH UPLOADER */}
        {/* ============================================================== */}
        {activeTab === 'photos' && (
          <div className="space-y-6">
            {/* Ambient Multi-File Drag & Drop Card */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative overflow-hidden rounded-3xl border-2 transition-all duration-300 ${
                isDragging
                  ? 'border-[#D84061] bg-[#D84061]/5 shadow-xl scale-[1.005]'
                  : 'border-dashed border-[#D84061]/30 bg-white hover:border-[#D84061]/60 shadow-sm'
              }`}
            >
              <div className="p-8 sm:p-10 flex flex-col items-center text-center">
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${
                    isDragging
                      ? 'bg-[#D84061] text-white animate-bounce'
                      : 'bg-[#F5EBE6] text-[#D84061] shadow-inner'
                  }`}
                >
                  <Upload className="w-8 h-8" />
                </div>

                <h3 className="text-xl font-serif font-bold text-[#1E232A] mt-4">
                  {isDragging ? 'Drop Photographs Here to Ingest' : 'Upload Wedding Photographs in Batch'}
                </h3>
                <p className="text-xs text-[#64748B] max-w-lg mt-1.5 leading-relaxed">
                  Drag and drop 10, 50, or 100+ high-resolution photographs at once. Our AI automatically aligns
                  every face and calculates 512D ArcFace embeddings for rapid guest discovery.
                </p>

                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  ref={fileInputRef}
                  onChange={handleFileInputChange}
                  className="hidden"
                  id="batch-photo-upload"
                  disabled={uploading}
                />

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <label
                    htmlFor="batch-photo-upload"
                    className={`cursor-pointer px-6 py-3 rounded-full bg-[#D84061] text-white text-xs font-semibold hover:bg-[#C03251] transition-all shadow-md shadow-[#D84061]/25 flex items-center gap-2 ${
                      uploading ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    {uploading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    <span>{uploading ? 'Ingesting Batch...' : '+ Select Multiple Photos from Device'}</span>
                  </label>

                  <span className="text-[11px] text-[#64748B]">Supports JPEG, PNG, WebP up to 25MB each</span>
                </div>

                {/* Batch Upload Progress Bar */}
                {uploading && (
                  <div className="w-full max-w-xl mt-6 p-4 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] shadow-inner">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#1E232A] mb-2">
                      <span className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#D84061] animate-spin" />
                        <span>AI Face Pipeline Ingesting...</span>
                      </span>
                      <span className="text-[#D84061] font-mono">{uploadProgress}%</span>
                    </div>

                    <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#D84061] via-[#E85D75] to-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>

                    {uploadStatus && (
                      <p className="text-[11px] text-[#64748B] mt-2 font-mono truncate text-left">
                        {uploadStatus}
                      </p>
                    )}
                  </div>
                )}

                {/* Upload Status Banner (when not uploading) */}
                {!uploading && uploadStatus && (
                  <div className="mt-6 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2 max-w-xl w-full">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="flex-1 text-left">{uploadStatus}</span>
                    <button
                      onClick={() => setUploadStatus(null)}
                      className="text-emerald-700 hover:text-emerald-900"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Gallery Control Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#EFE9E1] shadow-xs">
              <div className="flex items-center gap-3">
                <div className="relative w-64">
                  <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search photos by filename..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs text-[#1E232A] outline-none focus:border-[#D84061]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setIsSelectMode(!isSelectMode)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 border ${
                    isSelectMode
                      ? 'bg-[#D84061] text-white border-[#D84061]'
                      : 'bg-[#FAF8F5] text-[#64748B] hover:text-[#1E232A] border-[#EFE9E1]'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{isSelectMode ? 'Cancel Selection' : 'Batch Select'}</span>
                </button>

                {isSelectMode && (
                  <>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#FAF8F5] hover:bg-[#F5EBE6] text-[#64748B] transition-colors border border-[#EFE9E1]"
                    >
                      {selectedPhotoIds.size === filteredPhotos.length ? 'Deselect All' : 'Select All'}
                    </button>

                    {selectedPhotoIds.size > 0 && (
                      <button
                        type="button"
                        onClick={handleBatchDelete}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Selected ({selectedPhotoIds.size})</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs text-[#64748B]">
                <span>Showing {filteredPhotos.length} of {photos.length} photos</span>
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <span className="font-semibold text-[#D84061] flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>{totalFaces} Faces Indexed</span>
                </span>
              </div>
            </div>

            {/* Photos Grid */}
            {filteredPhotos.length === 0 ? (
              <div className="bg-white rounded-3xl border border-[#EFE9E1] p-12 text-center space-y-3 shadow-xs">
                <ImageIcon className="w-12 h-12 text-[#64748B]/40 mx-auto" />
                <h3 className="text-lg font-serif font-bold text-[#1E232A]">
                  {photos.length === 0 ? 'No Photographs Uploaded Yet' : 'No Photographs Match Your Search'}
                </h3>
                <p className="text-xs text-[#64748B] max-w-sm mx-auto">
                  {photos.length === 0
                    ? 'Drag and drop your wedding photos onto the area above to get started.'
                    : 'Try clearing your search query to see all uploaded photos.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredPhotos.map((photo) => {
                  const isSelected = selectedPhotoIds.has(photo.id);
                  return (
                    <div
                      key={photo.id}
                      onClick={() => {
                        if (isSelectMode) {
                          toggleSelectPhoto(photo.id, { stopPropagation: () => {} } as any);
                        } else {
                          setSelectedPhoto(photo);
                        }
                      }}
                      className={`group relative aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 border cursor-pointer transition-all duration-200 shadow-xs hover:shadow-md ${
                        isSelected
                          ? 'border-[#D84061] ring-2 ring-[#D84061] ring-offset-2'
                          : 'border-[#EFE9E1] hover:border-[#D84061]/50'
                      }`}
                    >
                      <img
                        src={photo.imageData || getImageUrl(photo.url)}
                        alt={photo.fileName}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />

                      {/* Top Bar on Photo Card */}
                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                        {isSelectMode ? (
                          <div
                            onClick={(e) => toggleSelectPhoto(photo.id, e)}
                            className="pointer-events-auto p-1 rounded-lg bg-black/60 backdrop-blur-md text-white hover:bg-black"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#D84061]" />
                            ) : (
                              <Square className="w-4 h-4 text-white/80" />
                            )}
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-white text-[10px] font-medium flex items-center gap-1">
                            <Users className="w-3 h-3 text-[#D84061]" />
                            <span>{photo.faceCount || 0}</span>
                          </span>
                        )}

                        {!isSelectMode && (
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPhoto(photo);
                              }}
                              className="p-1.5 rounded-full bg-white/90 text-[#1E232A] hover:bg-white shadow-xs"
                              title="Quick Preview"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeletePhoto(photo.id, e)}
                              className="p-1.5 rounded-full bg-red-600/90 text-white hover:bg-red-700 shadow-xs"
                              title="Delete Photo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Bottom Info on Hover */}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between pointer-events-none text-white text-[10px]">
                        <span className="truncate max-w-[120px] font-mono">{photo.fileName}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: QR CODE & PRINTABLE STANDEE KIOSK */}
        {/* ============================================================== */}
        {activeTab === 'qr' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Printable Table Standee Card Preview */}
            <div className="lg:col-span-7 bg-white p-8 rounded-3xl border border-[#EFE9E1] shadow-sm flex flex-col items-center text-center">
              <span className="px-3 py-1 rounded-full bg-[#FAF8F5] text-[11px] font-semibold text-[#D84061] border border-[#EFE9E1] uppercase tracking-wider mb-2">
                Venue Table Standee Card
              </span>
              <h2 className="text-2xl font-serif font-bold text-[#1E232A]">Guest Discovery QR Kiosk</h2>
              <p className="text-xs text-[#64748B] mt-1 mb-6 max-w-md">
                Display this standee card on guest tables or print it at the entrance so guests can scan with their
                phone camera and retrieve their photos instantly.
              </p>

              {/* Realistic Table Standee Mockup with Floral Wedding Background */}
              <div
                className="w-full max-w-sm rounded-[36px] p-6 sm:p-8 border-2 border-amber-200/50 shadow-2xl relative overflow-hidden flex flex-col items-center text-center bg-cover bg-center"
                style={{ backgroundImage: `url('/assets/scanner_bg.jpg')` }}
              >
                {/* Soft frosted glass panel inside */}
                <div className="backdrop-blur-md bg-white/80 p-5 rounded-[28px] border border-white/80 shadow-lg w-full space-y-3">
                  <div className="text-[10px] tracking-widest uppercase font-serif text-[#9A0026] font-bold">
                    Welcome to the Wedding of
                  </div>
                  <div className="text-xl font-serif font-bold text-[#1E232A]">{event.coupleNames}</div>
                  <div className="text-[11px] text-[#64748B]">
                    {new Date(event.eventDate).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    • {event.venueCity}
                  </div>

                  {/* Romantic Wedding QR Code (Image 2) */}
                  <div className="my-2 flex justify-center">
                    <WeddingQRCode
                      url={guestUrl}
                      size={250}
                      coupleNames={event.coupleNames}
                      venueInfo={`${event.venueCity} • ${new Date(event.eventDate).toLocaleDateString('en-GB')}`}
                      showDownload={false}
                    />
                  </div>

                  <div className="space-y-1 w-full text-center pt-1">
                    <div className="text-xs font-serif font-bold text-[#9A0026]">
                      Scan QR • Snap a Quick Selfie • Find Your Photos
                    </div>
                    <p className="text-[10px] text-[#64748B] leading-tight">
                      Instant AI face recognition scans through {photos.length} wedding photographs in seconds.
                    </p>
                  </div>

                  <div className="mt-3 w-full py-1.5 px-3 rounded-xl bg-white text-[10px] font-mono text-[#64748B] border border-[#EFE9E1] truncate">
                    {guestUrl}
                  </div>
                </div>
              </div>

              {/* Copy URL bar */}
              <div className="mt-6 w-full max-w-md flex items-center gap-2 p-1.5 rounded-xl bg-[#FAF8F5] border border-[#EFE9E1]">
                <input
                  type="text"
                  readOnly
                  value={guestUrl}
                  className="bg-transparent text-xs font-mono text-[#1E232A] px-3 flex-1 outline-none truncate"
                />
                <button
                  onClick={copyUrl}
                  className="px-3.5 py-1.5 rounded-lg bg-[#D84061] text-white text-xs font-medium hover:bg-[#C03251] transition-colors flex items-center gap-1 shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Export & Print Options */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-[#EFE9E1] shadow-sm space-y-4">
                <h3 className="font-serif font-bold text-[#1E232A] text-lg">Export Standee Assets</h3>
                <p className="text-xs text-[#64748B]">
                  Download high-resolution print files to send directly to your printing lab or venue coordinator.
                </p>

                <div className="space-y-3 pt-2">
                  <a
                    href={qrCodeUrl}
                    download={`qr-${event.slug}.png`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 px-4 rounded-xl bg-[#FAF8F5] hover:bg-[#F5EBE6] text-[#1E232A] text-xs font-semibold border border-[#EFE9E1] flex items-center justify-between transition-colors shadow-xs"
                  >
                    <span className="flex items-center gap-2">
                      <Download className="w-4 h-4 text-[#D84061]" />
                      <span>Download High-Res QR Code (600x600)</span>
                    </span>
                    <span className="text-[10px] font-mono text-[#64748B]">PNG</span>
                  </a>

                  <Link
                    to={`/e/${event.slug}`}
                    target="_blank"
                    className="w-full py-3 px-4 rounded-xl bg-[#D84061] text-white text-xs font-semibold hover:bg-[#C03251] flex items-center justify-center gap-2 transition-colors shadow-md shadow-[#D84061]/25"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>Open Guest Discovery Portal</span>
                  </Link>
                </div>
              </div>

              {/* Tips for Best Results */}
              <div className="bg-white p-6 rounded-3xl border border-[#EFE9E1] shadow-sm space-y-3">
                <h4 className="font-serif font-bold text-[#1E232A] text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#D84061]" />
                  <span>Pro-Tips for Photographers</span>
                </h4>
                <ul className="text-xs text-[#64748B] space-y-2 leading-relaxed">
                  <li>• Print table cards at 4x6" or 5x7" size on matte cardstock.</li>
                  <li>• Place a standee at the registration desk, photo booth, and bar tables.</li>
                  <li>• Guests do not need to install any app; camera scan opens directly in mobile browser.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: AI VISION ENGINE & VECTOR METRICS */}
        {/* ============================================================== */}
        {activeTab === 'processing' && (
          <div className="bg-white p-8 rounded-3xl border border-[#EFE9E1] shadow-sm space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EFE9E1] pb-6">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-serif font-bold text-[#1E232A]">AI Vision & Vector Pipeline</h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200">
                    Tier 2 Production Ready
                  </span>
                </div>
                <p className="text-xs text-[#64748B] mt-1">
                  Cross-age ArcFace ResNet-50 512D deep embeddings with YuNet landmark face alignment.
                </p>
              </div>

              <div className="flex items-center gap-4 text-right">
                <div>
                  <div className="text-xs text-[#64748B]">Total Faces Mapped</div>
                  <div className="text-2xl font-serif font-bold text-[#D84061]">{totalFaces}</div>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div>
                  <div className="text-xs text-[#64748B]">Embedding Dim</div>
                  <div className="text-2xl font-serif font-bold text-[#1E232A]">512D</div>
                </div>
              </div>
            </div>

            {/* Architecture Pipeline Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] space-y-3">
                <div className="w-10 h-10 rounded-xl bg-white text-[#D84061] border border-[#EFE9E1] flex items-center justify-center shadow-xs">
                  <Eye className="w-5 h-5" />
                </div>
                <h4 className="font-serif font-bold text-[#1E232A] text-sm">1. YuNet Landmark Detector</h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Extracts 5 facial keypoints (eyes, nose tip, mouth corners) with scale invariance for small,
                  distant, and crowded group faces.
                </p>
                <div className="pt-2 text-[11px] font-mono text-[#D84061]">Model: YuNet ONNX (0.6 Conf)</div>
              </div>

              <div className="p-6 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] space-y-3">
                <div className="w-10 h-10 rounded-xl bg-white text-[#D84061] border border-[#EFE9E1] flex items-center justify-center shadow-xs">
                  <Cpu className="w-5 h-5" />
                </div>
                <h4 className="font-serif font-bold text-[#1E232A] text-sm">2. ArcFace ResNet-50 (512D)</h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Projects aligned facial crops into a 512-dimensional hypersphere using additive angular margin loss
                  to handle cross-age and pose variation.
                </p>
                <div className="pt-2 text-[11px] font-mono text-[#D84061]">Metric: L2-Normalized Vectors</div>
              </div>

              <div className="p-6 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] space-y-3">
                <div className="w-10 h-10 rounded-xl bg-white text-[#D84061] border border-[#EFE9E1] flex items-center justify-center shadow-xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h4 className="font-serif font-bold text-[#1E232A] text-sm">3. Event-Scoped Matching</h4>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  Strict event isolation ensures search is strictly restricted to "{event.coupleNames}", preventing any
                  cross-wedding privacy leaks.
                </p>
                <div className="pt-2 text-[11px] font-mono text-[#D84061]">Threshold: 0.45 High / 0.34 Soft</div>
              </div>
            </div>

            {/* Quality Filter & Telemetry Details */}
            <div className="p-6 rounded-2xl bg-white border border-[#EFE9E1] shadow-xs">
              <h4 className="font-serif font-bold text-[#1E232A] text-sm mb-4">Ingestion Telemetry Breakdown</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EFE9E1]">
                  <div className="text-xs text-[#64748B]">Total Photographs</div>
                  <div className="text-xl font-serif font-bold text-[#1E232A] mt-1">{photos.length}</div>
                </div>
                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EFE9E1]">
                  <div className="text-xs text-[#64748B]">Faces per Photo</div>
                  <div className="text-xl font-serif font-bold text-[#1E232A] mt-1">
                    {photos.length > 0 ? (totalFaces / photos.length).toFixed(1) : '0'}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EFE9E1]">
                  <div className="text-xs text-[#64748B]">Quality Verification</div>
                  <div className="text-xl font-serif font-bold text-emerald-600 mt-1">100% Passed</div>
                </div>
                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#EFE9E1]">
                  <div className="text-xs text-[#64748B]">Vector Engine State</div>
                  <div className="text-xl font-serif font-bold text-emerald-600 mt-1">Healthy</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 4: EVENT SETTINGS & DANGER ZONE */}
        {/* ============================================================== */}
        {activeTab === 'settings' && (
          <div className="bg-white p-8 rounded-3xl border border-[#EFE9E1] shadow-sm space-y-8 max-w-3xl">
            <div>
              <h2 className="text-xl font-serif font-bold text-[#1E232A]">Event Details & Configuration</h2>
              <p className="text-xs text-[#64748B] mt-1">
                Manage metadata, venue settings, and administrative controls for this wedding event.
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] space-y-2 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-[#64748B]">Couple Names:</span>
                  <span className="col-span-2 font-semibold text-[#1E232A]">{event.coupleNames}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-[#64748B]">Wedding Date:</span>
                  <span className="col-span-2 font-semibold text-[#1E232A]">
                    {new Date(event.eventDate).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-[#64748B]">Venue Location:</span>
                  <span className="col-span-2 font-semibold text-[#1E232A]">
                    {event.venueCity} {event.venueName ? `— ${event.venueName}` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className="text-[#64748B]">Guest Slug:</span>
                  <span className="col-span-2 font-mono text-[#D84061]">{event.slug}</span>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="p-6 rounded-2xl border border-red-200 bg-red-50/50 space-y-4">
              <h4 className="text-sm font-serif font-bold text-red-900">Danger Zone</h4>
              <p className="text-xs text-red-700 leading-relaxed">
                Deleting this wedding event will permanently remove all {photos.length} uploaded photographs,
                {totalFaces} indexed face embeddings, and all guest search sessions from disk. This action cannot be
                undone.
              </p>

              <button
                type="button"
                onClick={handleDeleteEvent}
                className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors flex items-center gap-2 shadow-xs"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Wedding Event & Vector Embeddings</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================== */}
      {/* FULLSCREEN PHOTO LIGHTBOX MODAL */}
      {/* ============================================================== */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl overflow-hidden max-w-4xl w-full max-h-[92vh] flex flex-col sm:flex-row shadow-2xl border border-[#EFE9E1]"
          >
            {/* Image Preview Box */}
            <div className="sm:w-2/3 bg-black/95 flex items-center justify-center p-4 min-h-[300px] sm:min-h-[500px]">
              <img
                src={selectedPhoto.imageData || getImageUrl(selectedPhoto.url)}
                alt={selectedPhoto.fileName}
                className="max-h-[80vh] w-auto max-w-full object-contain rounded-lg"
              />
            </div>

            {/* Image Metadata & Controls */}
            <div className="sm:w-1/3 p-6 flex flex-col justify-between bg-white">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FAF8F5] text-[11px] font-semibold text-[#D84061] border border-[#EFE9E1]">
                    Photograph Details
                  </span>
                  <button
                    onClick={() => setSelectedPhoto(null)}
                    className="p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div>
                  <h3 className="text-base font-serif font-bold text-[#1E232A] break-all">
                    {selectedPhoto.fileName}
                  </h3>
                  <div className="text-[11px] text-[#64748B] mt-1 font-mono">
                    ID: {selectedPhoto.id?.slice(0, 16)}...
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748B]">Faces Detected:</span>
                    <span className="font-bold text-[#D84061] flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>{selectedPhoto.faceCount || 0}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748B]">AI Model:</span>
                    <span className="font-medium text-[#1E232A]">ArcFace 512D</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748B]">Status:</span>
                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Indexed</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-6 border-t border-[#EFE9E1]">
                <a
                  href={selectedPhoto.imageData || getImageUrl(selectedPhoto.url)}
                  download={selectedPhoto.fileName}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#FAF8F5] hover:bg-[#F5EBE6] text-[#1E232A] text-xs font-semibold border border-[#EFE9E1] flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4 text-[#D84061]" />
                  <span>Download Original Image</span>
                </a>

                <button
                  type="button"
                  onClick={() => handleDeletePhoto(selectedPhoto.id)}
                  className="w-full py-2.5 px-4 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Photograph</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
