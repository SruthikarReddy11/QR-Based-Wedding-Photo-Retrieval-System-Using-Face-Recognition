import React, { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Camera,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Heart,
  Download,
  Share2,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Upload,
} from 'lucide-react';
import { api, getImageUrl } from '../lib/api';

export const GuestEventPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();

  const [event, setEvent] = useState<any>(null);
  const [loadingEvent, setLoadingEvent] = useState(true);

  // Guest flow step states: 'landing' -> 'privacy' -> 'camera' -> 'processing' -> 'results'
  const [step, setStep] = useState<'landing' | 'privacy' | 'camera' | 'processing' | 'results'>('landing');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<'all' | 'high' | 'suggested' | 'portraits' | 'group'>('all');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [likedPhotos, setLikedPhotos] = useState<Set<number>>(new Set());

  // Search Results from real AI matching
  const [matches, setMatches] = useState<any[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [executionTime, setExecutionTime] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        setLoadingEvent(true);
        const res = await api.get(`/public/events/${slug}`);
        setEvent(res.data);
      } catch (err: any) {
        console.error('Failed to load wedding event:', err);
      } finally {
        setLoadingEvent(false);
      }
    };

    if (slug) {
      fetchEvent();
    }
  }, [slug]);

  // Start Front-Facing Camera for Step 4
  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      setCameraStream(stream);
      setStep('camera');
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err: any) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError('Camera access unavailable. You can upload a selfie photo instead.');
      setStep('camera');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Capture frame from video and submit to real AI search
  const takeSelfie = async () => {
    let selfieB64 = '';

    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 640;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        selfieB64 = canvas.toDataURL('image/jpeg', 0.85);
      }
    }

    stopCamera();

    if (!selfieB64) {
      setCameraError('Could not capture frame. Please upload a selfie image.');
      return;
    }

    await performRealSearch(selfieB64);
  };

  const handleSelfieUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    stopCamera();
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result as string;
      await performRealSearch(b64);
    };
    reader.readAsDataURL(file);
  };

  const optimizeSelfieBase64 = async (b64: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1080;
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
        if (!ctx) return resolve(b64);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => resolve(b64);
      img.src = b64;
    });
  };

  const performRealSearch = async (rawBase64: string) => {
    setStep('processing');
    setSearchError(null);

    try {
      const selfieBase64 = await optimizeSelfieBase64(rawBase64);
      const res = await api.post(`/public/events/${slug}/search`, { selfieBase64 });
      const data = res.data;

      if (!data.selfieValid) {
        setSearchError(data.error || 'No face detected in selfie. Please try again with clear lighting.');
        setMatches([]);
      } else {
        setMatches(data.matches || []);
        setExecutionTime(data.executionTimeMs || 0);
        if (data.matches.length === 0) {
          setSearchError('No matching photos found for your face in this wedding album. Try a clearer angle!');
        }
      }
    } catch (err: any) {
      console.error('[Search Error]', err);
      setSearchError(err.response?.data?.error || 'Failed to process face search. Please try again.');
      setMatches([]);
    } finally {
      setStep('results');
    }
  };

  const filteredPhotos = matches.filter((match) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'high') return match.matchTier === 'high_confidence';
    if (activeFilter === 'suggested') return match.matchTier === 'suggested';
    if (activeFilter === 'portraits') return (match.faceCount || 1) <= 2;
    if (activeFilter === 'group') return (match.faceCount || 1) > 2;
    return true;
  });

  const toggleLike = (index: number) => {
    setLikedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleShare = async (photoUrl: string) => {
    const fullUrl = getImageUrl(photoUrl);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `My Photo from ${event?.coupleNames || 'Wedding'}`,
          text: `Found my photo on WedSnap!`,
          url: fullUrl,
        });
      } catch (err) {
        console.warn('Share cancelled', err);
      }
    } else {
      navigator.clipboard.writeText(fullUrl);
      alert('Photo link copied to clipboard!');
    }
  };

  if (loadingEvent) {
    return (
      <div
        className="min-h-screen w-full relative flex items-center justify-center p-6 bg-cover bg-center text-[#1E232A]"
        style={{ backgroundImage: `url('/assets/scanner_bg.jpg')` }}
      >
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px]" />
        <div className="relative z-10 p-8 rounded-3xl backdrop-blur-xl bg-white/80 border border-white/60 shadow-2xl flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#9A0026] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-serif font-bold text-[#1E232A]">Loading wedding memories...</p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div
        className="min-h-screen w-full relative flex items-center justify-center p-6 bg-cover bg-center text-[#1E232A]"
        style={{ backgroundImage: `url('/assets/scanner_bg.jpg')` }}
      >
        <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px]" />
        <div className="relative z-10 p-8 rounded-3xl backdrop-blur-xl bg-white/85 border border-white/60 shadow-2xl max-w-sm w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <Heart className="w-6 h-6 text-[#9A0026]" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#1E232A]">Wedding Not Found</h2>
          <p className="text-xs text-[#64748B]">Please verify the QR link with the wedding host or photographer.</p>
          <Link
            to="/"
            className="inline-block px-5 py-2.5 rounded-full bg-[#9A0026] text-white text-xs font-semibold shadow-md"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen w-full relative flex items-center justify-center p-0 sm:p-4 bg-cover bg-center bg-fixed text-[#1E232A]"
      style={{ backgroundImage: `url('/assets/scanner_bg.jpg')` }}
    >
      {/* Ambient Bokeh and Sparkle Backdrop Overlay */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[1px] pointer-events-none z-0" />

      {/* Main Glassmorphic Scanner Card */}
      <div className="relative z-10 w-full max-w-md min-h-[92vh] flex flex-col justify-between backdrop-blur-xl bg-white/85 sm:rounded-[36px] shadow-[0_25px_60px_rgba(154,0,38,0.25)] border border-white/60 overflow-hidden my-auto">
        <canvas ref={canvasRef} className="hidden" />

        {/* ============================================================ */}
        {/* SCREEN 1: EVENT LANDING PAGE                                 */}
        {/* ============================================================ */}
        {step === 'landing' && (
          <div className="flex-1 flex flex-col justify-between p-6 text-center animate-fade-in">
            <div className="space-y-6 pt-2">
              <div className="relative aspect-[4/5] w-full rounded-3xl overflow-hidden shadow-2xl border-4 border-white bg-slate-100 group">
                <img
                  src={event.coverPhotoUrl}
                  alt={event.coupleNames}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

                {/* Floating Heart Ornament */}
                <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-white/80 backdrop-blur-md text-[#9A0026] text-[11px] font-serif font-bold shadow-md flex items-center gap-1 border border-white">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>AI Powered</span>
                </div>

                <div className="absolute bottom-6 left-4 right-4 text-white">
                  <div className="flex items-center justify-center gap-1 text-[11px] uppercase tracking-widest text-[#FAF8F5]/90 font-medium">
                    <Heart className="w-3 h-3 text-[#E85D75] fill-current" />
                    <span>Wedding Memories</span>
                    <Heart className="w-3 h-3 text-[#E85D75] fill-current" />
                  </div>
                  <h1 className="text-3xl font-serif font-bold mt-1 text-white drop-shadow-md">
                    {event.coupleNames}
                  </h1>
                  <div className="text-xs text-[#FAF8F5]/90 mt-1 font-light">
                    {new Date(event.eventDate).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    • {event.venueCity}
                  </div>
                </div>
              </div>

              {/* Quick Album Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-white/90 border border-[#EFE9E1] shadow-xs">
                  <div className="text-lg font-bold text-[#1E232A]">{event.photoCount || 0}</div>
                  <div className="text-[10px] text-[#64748B] font-medium">Wedding Photos</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/90 border border-[#EFE9E1] shadow-xs">
                  <div className="text-lg font-bold text-[#9A0026]">{event.faceCount || 0}</div>
                  <div className="text-[10px] text-[#64748B] font-medium">Faces Indexed</div>
                </div>
              </div>
            </div>

            {/* Find Photos Call to Action */}
            <div className="space-y-3 pt-6 pb-2">
              <button
                onClick={() => setStep('privacy')}
                className="w-full py-4 rounded-full bg-gradient-to-r from-[#9A0026] via-[#B81439] to-[#9A0026] text-white font-medium hover:brightness-110 transition-all shadow-xl shadow-[#9A0026]/30 flex items-center justify-center gap-2 text-base"
              >
                <Camera className="w-5 h-5" />
                <span>Find My Photos</span>
              </button>
              <div className="text-[11px] text-[#64748B]">
                Snap a selfie to find all your pictures with AI face recognition
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* SCREEN 2: PRIVACY & CAMERA CONSENT                           */}
        {/* ============================================================ */}
        {step === 'privacy' && (
          <div className="flex-1 flex flex-col justify-between p-8 text-center bg-white/90 animate-fade-in">
            <div className="space-y-6 pt-4">
              <div className="w-20 h-20 rounded-full bg-[#FAF0EA] text-[#9A0026] flex items-center justify-center mx-auto shadow-inner border border-[#EFE9E1]">
                <ShieldCheck className="w-10 h-10 text-[#9A0026]" />
              </div>

              <div>
                <h2 className="text-2xl font-serif font-bold text-[#1E232A]">Find My Photos</h2>
                <p className="text-xs text-[#64748B] mt-1">Real-Time Facial Vector Discovery</p>
              </div>

              <div className="bg-[#FAF8F5] rounded-3xl p-6 border border-[#EFE9E1] space-y-4 text-left text-xs leading-relaxed">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#9A0026] shrink-0 mt-0.5" />
                  <span className="text-[#1E232A]">
                    We use your camera to capture a selfie and compute an instant mathematical face vector.
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#9A0026] shrink-0 mt-0.5" />
                  <span className="text-[#1E232A]">
                    Your selfie is processed in-memory and <strong>strictly deleted immediately</strong> after
                    search.
                  </span>
                </div>

                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#9A0026] shrink-0 mt-0.5" />
                  <span className="text-[#1E232A]">
                    Searches are strictly restricted <strong>only to {event.coupleNames}'s wedding album</strong>.
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-3 pb-2">
              <button
                onClick={startCamera}
                className="w-full py-4 rounded-full bg-[#9A0026] text-white font-medium hover:bg-[#800020] transition-all shadow-xl shadow-[#9A0026]/25 text-base"
              >
                Continue to Camera
              </button>

              <button
                onClick={() => setStep('landing')}
                className="w-full py-2.5 text-xs text-[#64748B] hover:text-[#1E232A]"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* SCREEN 3: LIVE SELFIE CAMERA SCANNER                         */}
        {/* ============================================================ */}
        {step === 'camera' && (
          <div className="flex-1 flex flex-col justify-between bg-black/95 text-white p-6 relative overflow-hidden animate-fade-in">
            {/* Top Navigation */}
            <div className="flex items-center justify-between z-10">
              <button
                onClick={() => {
                  stopCamera();
                  setStep('privacy');
                }}
                className="p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <span className="text-xs uppercase tracking-widest font-semibold text-white/90 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>AI Face Scanner</span>
              </span>
              <div className="w-9" />
            </div>

            {/* Camera Viewport / Fallback */}
            <div className="relative my-auto flex flex-col items-center">
              {cameraError ? (
                <div className="p-6 text-center space-y-4 bg-zinc-900 rounded-3xl border border-zinc-800 max-w-xs shadow-2xl">
                  <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
                  <div className="text-xs text-zinc-300 leading-relaxed">{cameraError}</div>
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleSelfieUpload}
                    className="hidden"
                    id="selfie-file-input"
                  />
                  <label
                    htmlFor="selfie-file-input"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[#9A0026] text-white text-xs font-semibold cursor-pointer shadow-lg"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload Selfie Image</span>
                  </label>
                </div>
              ) : (
                <div className="relative">
                  {/* Glowing Romantic Golden Ring with Breathing Pulse */}
                  <div className="w-68 h-68 sm:w-76 sm:h-76 rounded-full border-4 border-amber-300/80 p-1.5 shadow-[0_0_35px_rgba(235,213,189,0.4)] relative flex items-center justify-center animate-pulse">
                    <div className="w-full h-full rounded-full overflow-hidden relative shadow-inner bg-zinc-900">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover -scale-x-100"
                      />
                      {/* Dotted Alignment Overlay */}
                      <div className="absolute inset-0 border-2 border-dashed border-[#9A0026]/70 rounded-full pointer-events-none" />
                    </div>
                  </div>

                  {/* Corner Heart Accent */}
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 p-1.5 rounded-full bg-[#9A0026] text-white shadow-md">
                    <Heart className="w-4 h-4 fill-current text-white" />
                  </div>
                </div>
              )}

              {!cameraError && (
                <div className="mt-6 text-center space-y-1">
                  <div className="text-sm font-semibold text-white drop-shadow">Center your face in the oval</div>
                  <div className="text-xs text-white/70">Good lighting • Remove sunglasses • Direct angle</div>
                </div>
              )}
            </div>

            {/* Shutter Button */}
            {!cameraError && (
              <div className="flex items-center justify-center pb-4 z-10">
                <button
                  onClick={takeSelfie}
                  className="w-20 h-20 rounded-full border-4 border-amber-200/80 p-1 hover:scale-105 active:scale-95 transition-transform shadow-xl"
                  title="Snap Selfie"
                >
                  <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#9A0026] to-[#C21844] flex items-center justify-center shadow-lg">
                    <Camera className="w-8 h-8 text-white" />
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* SCREEN 4: AI SCANNING & VECTOR MATCHING                      */}
        {/* ============================================================ */}
        {step === 'processing' && (
          <div className="flex-1 flex flex-col justify-center items-center p-8 text-center bg-white/90 animate-fade-in space-y-8">
            <div className="relative">
              <div className="w-32 h-32 rounded-full border-4 border-[#FAF0EA] flex items-center justify-center animate-spin border-t-[#9A0026]" />
              <div className="absolute inset-0 flex items-center justify-center text-[#9A0026]">
                <Heart className="w-8 h-8 fill-current text-[#9A0026] animate-pulse" />
              </div>
            </div>

            <div className="space-y-1">
              <h2 className="text-2xl font-serif font-bold text-[#1E232A]">Searching Wedding Memories...</h2>
              <p className="text-xs text-[#64748B]">Matching your facial embedding against {event.coupleNames}'s gallery</p>
            </div>

            <div className="w-full max-w-xs space-y-3 text-left text-xs bg-[#FAF8F5] p-5 rounded-2xl border border-[#EFE9E1] shadow-xs">
              <div className="flex items-center gap-2.5 text-emerald-700 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>YuNet 5-landmark face alignment ✓</span>
              </div>
              <div className="flex items-center gap-2.5 text-emerald-700 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Extracting ArcFace 512D deep vector ✓</span>
              </div>
              <div className="flex items-center gap-2.5 text-[#9A0026] font-semibold animate-pulse">
                <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
                <span>Matching against event gallery...</span>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* SCREEN 5: PERSONALIZED GALLERY RESULTS                       */}
        {/* ============================================================ */}
        {step === 'results' && (
          <div className="flex-1 flex flex-col bg-[#FAF8F5]/90 animate-fade-in pb-8">
            <div className="p-5 bg-white/95 border-b border-[#EFE9E1] sticky top-0 z-20 backdrop-blur-md">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#1E232A]">
                    {matches.length > 0 ? `We found ${matches.length} photo(s) of you! 🎉` : 'Search Results'}
                  </h2>
                  <div className="text-[11px] text-[#64748B]">
                    {event.coupleNames} {executionTime > 0 ? `• matched in ${executionTime}ms` : ''}
                  </div>
                </div>
                <button
                  onClick={() => setStep('privacy')}
                  className="px-3 py-1 rounded-full bg-[#FAF0EA] text-[#9A0026] text-xs font-semibold hover:bg-[#F3E2D8] transition-colors border border-[#EFE9E1]"
                >
                  Retake Selfie
                </button>
              </div>

              {matches.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                  <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 py-1 rounded-full font-semibold whitespace-nowrap transition-colors ${
                      activeFilter === 'all'
                        ? 'bg-[#9A0026] text-white shadow-xs'
                        : 'bg-[#FAF8F5] text-[#64748B] border border-[#EFE9E1]'
                    }`}
                  >
                    All ({matches.length})
                  </button>
                  <button
                    onClick={() => setActiveFilter('high')}
                    className={`px-3 py-1 rounded-full font-semibold whitespace-nowrap transition-colors ${
                      activeFilter === 'high'
                        ? 'bg-[#9A0026] text-white shadow-xs'
                        : 'bg-[#FAF8F5] text-[#64748B] border border-[#EFE9E1]'
                    }`}
                  >
                    High Match ({matches.filter((m) => m.matchTier === 'high_confidence').length})
                  </button>
                  {matches.some((m) => m.matchTier === 'suggested') && (
                    <button
                      onClick={() => setActiveFilter('suggested')}
                      className={`px-3 py-1 rounded-full font-semibold whitespace-nowrap transition-colors ${
                        activeFilter === 'suggested'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-[#FAF8F5] text-[#64748B] border border-[#EFE9E1]'
                      }`}
                    >
                      Suggested ({matches.filter((m) => m.matchTier === 'suggested').length})
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Error or Empty State */}
            {searchError && (
              <div className="p-6 m-4 rounded-3xl bg-white border border-[#EFE9E1] text-center space-y-3 shadow-xs">
                <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
                <h3 className="text-base font-serif font-bold text-[#1E232A]">Notice</h3>
                <p className="text-xs text-[#64748B] leading-relaxed">{searchError}</p>
                <button
                  onClick={() => setStep('privacy')}
                  className="px-5 py-2 rounded-full bg-[#9A0026] text-white text-xs font-semibold shadow-md"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Photos Grid */}
            {matches.length > 0 && (
              <div className="p-4 grid grid-cols-2 gap-3">
                {filteredPhotos.map((photo, index) => (
                  <div
                    key={photo.id || index}
                    onClick={() => setSelectedPhotoIndex(index)}
                    className="aspect-[3/4] rounded-2xl overflow-hidden bg-slate-200 border border-[#EFE9E1] relative cursor-pointer group shadow-sm hover:shadow-md transition-all"
                  >
                    <img
                      src={getImageUrl(photo.url)}
                      alt="Found wedding photo"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-white drop-shadow">
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-md backdrop-blur-sm ${
                          photo.matchTier === 'high_confidence'
                            ? 'bg-[#9A0026]/90 text-white'
                            : 'bg-amber-600/90 text-white'
                        }`}
                      >
                        {photo.matchTier === 'high_confidence' ? 'High Match' : 'Suggested'} •{' '}
                        {Math.round(photo.similarityScore * 100)}%
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(index);
                        }}
                        className="p-1 rounded-full bg-black/40 backdrop-blur-sm text-white"
                      >
                        <Heart
                          className={`w-3.5 h-3.5 ${
                            likedPhotos.has(index) ? 'text-[#E85D75] fill-current' : 'text-white'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* SCREEN 6: PHOTO VIEWER LIGHTBOX                              */}
      {/* ============================================================ */}
      {selectedPhotoIndex !== null && filteredPhotos[selectedPhotoIndex] && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between text-white animate-fade-in">
          <div className="p-4 flex items-center justify-between">
            <span className="text-xs text-white/70 font-mono">
              {selectedPhotoIndex + 1} / {filteredPhotos.length}
            </span>
            <button
              onClick={() => setSelectedPhotoIndex(null)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative flex-1 flex items-center justify-center p-4">
            <img
              src={getImageUrl(filteredPhotos[selectedPhotoIndex].url)}
              alt="Fullscreen Wedding View"
              className="max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl"
            />

            {selectedPhotoIndex > 0 && (
              <button
                onClick={() => setSelectedPhotoIndex(selectedPhotoIndex - 1)}
                className="absolute left-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/80"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {selectedPhotoIndex < filteredPhotos.length - 1 && (
              <button
                onClick={() => setSelectedPhotoIndex(selectedPhotoIndex + 1)}
                className="absolute right-2 p-2 rounded-full bg-black/50 text-white hover:bg-black/80"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          <div className="p-6 bg-black/60 border-t border-white/10 flex items-center justify-around">
            <button
              onClick={() => toggleLike(selectedPhotoIndex)}
              className="flex flex-col items-center gap-1 text-xs text-white/80 hover:text-white"
            >
              <Heart
                className={`w-6 h-6 ${
                  likedPhotos.has(selectedPhotoIndex) ? 'text-[#E85D75] fill-current' : 'text-white'
                }`}
              />
              <span>Like</span>
            </button>

            <a
              href={getImageUrl(filteredPhotos[selectedPhotoIndex].url)}
              download
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center gap-1 text-xs text-white/80 hover:text-white"
            >
              <Download className="w-6 h-6" />
              <span>Download</span>
            </a>

            <button
              onClick={() => handleShare(filteredPhotos[selectedPhotoIndex].url)}
              className="flex flex-col items-center gap-1 text-xs text-white/80 hover:text-white"
            >
              <Share2 className="w-6 h-6" />
              <span>Share</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
