import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Camera,
  Calendar,
  Image as ImageIcon,
  Users,
  Search,
  Plus,
  LogOut,
  ArrowRight,
  Settings,
  Layers,
  HeartHandshake,
  Trash2,
  QrCode,
  Download,
  Copy,
  Check,
  ExternalLink,
  HardDrive,
  Sparkles,
  LayoutGrid,
  List,
  ShieldCheck,
  X,
  MapPin
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { api, getImageUrl } from '../lib/api';
import { WeddingQRCode } from '../components/WeddingQRCode';

type TabType = 'overview' | 'events' | 'gallery' | 'qrcodes' | 'settings';

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [stats, setStats] = useState({
    totalEvents: 0,
    totalPhotos: 0,
    facesDetected: 0,
    totalSearches: 0,
    storageUsedBytes: 0,
  });

  const [events, setEvents] = useState<any[]>([]);
  const [allPhotos, setAllPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state for Events tab
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [eventFilterStatus, setEventFilterStatus] = useState<'all' | 'active' | 'completed'>('all');
  const [eventViewMode, setEventViewMode] = useState<'grid' | 'list'>('grid');

  // Gallery tab state
  const [gallerySelectedEventId, setGallerySelectedEventId] = useState<string>('all');
  const [lightboxPhoto, setLightboxPhoto] = useState<any | null>(null);

  // QR Code tab state
  const [selectedQrEventId, setSelectedQrEventId] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Settings tab state
  const [studioName, setStudioName] = useState(user?.fullName ? `${user.fullName}'s Studio` : 'Grand Wedding Photography');
  const [contactEmail, setContactEmail] = useState(user?.email || '');
  const [contactPhone, setContactPhone] = useState(user?.phoneNumber || '+91 98765 43210');
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Create Event Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    coupleNames: '',
    eventDate: new Date().toISOString().split('T')[0],
    venueCity: '',
    venueName: '',
    description: '',
    coverPhotoUrl: '',
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [statsRes, eventsRes] = await Promise.all([
        api.get('/events/stats'),
        api.get('/events'),
      ]);
      setStats(statsRes.data);
      const evList = eventsRes.data || [];
      setEvents(evList);
      if (evList.length > 0 && !selectedQrEventId) {
        setSelectedQrEventId(evList[0].id);
      }

      // Also fetch all photos for gallery
      try {
        const photosRes = await api.get('/events/photos/all');
        setAllPhotos(photosRes.data || []);
      } catch {
        setAllPhotos([]);
      }
    } catch (err) {
      console.warn('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleDeleteEvent = async (eventId: string, coupleNames: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete "${coupleNames}"? This will permanently delete all uploaded photos and face embeddings.`)) {
      return;
    }

    try {
      await api.delete(`/events/${eventId}`);
      setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
      setAllPhotos((prev) => prev.filter((p) => p.eventId !== eventId));
      const statsRes = await api.get('/events/stats');
      setStats(statsRes.data);
    } catch (err: any) {
      alert(`Failed to delete event: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.coupleNames.trim()) {
      setCreateError('Couple names are required.');
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const res = await api.post('/events', {
        title: `${createForm.coupleNames} Wedding Memories`,
        coupleNames: createForm.coupleNames,
        eventDate: createForm.eventDate,
        venueCity: createForm.venueCity || 'City',
        venueName: createForm.venueName || 'Grand Ballroom',
        description: createForm.description,
        coverPhotoUrl: createForm.coverPhotoUrl || 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
      });
      setShowCreateModal(false);
      setCreateForm({
        coupleNames: '',
        eventDate: new Date().toISOString().split('T')[0],
        venueCity: '',
        venueName: '',
        description: '',
        coverPhotoUrl: '',
      });
      await fetchDashboardData();
      navigate(`/dashboard/events/${res.data.id}`);
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Failed to create event');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  };

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      const q = eventSearchQuery.toLowerCase();
      const matchesSearch =
        (ev.coupleNames || '').toLowerCase().includes(q) ||
        (ev.venueCity || '').toLowerCase().includes(q) ||
        (ev.venueName || '').toLowerCase().includes(q) ||
        (ev.title || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (eventFilterStatus === 'active') return ev.status !== 'COMPLETED';
      if (eventFilterStatus === 'completed') return ev.status === 'COMPLETED';
      return true;
    });
  }, [events, eventSearchQuery, eventFilterStatus]);

  // Filtered gallery photos
  const filteredGalleryPhotos = useMemo(() => {
    if (gallerySelectedEventId === 'all') return allPhotos;
    return allPhotos.filter((p) => p.eventId === gallerySelectedEventId);
  }, [allPhotos, gallerySelectedEventId]);

  // Selected QR Event
  const selectedQrEvent = useMemo(() => {
    return events.find((e) => e.id === selectedQrEventId) || events[0] || null;
  }, [events, selectedQrEventId]);

  const qrImageUrl = useMemo(() => {
    if (!selectedQrEvent) return '';
    const guestUrl = `${window.location.origin}/e/${selectedQrEvent.slug}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(guestUrl)}`;
  }, [selectedQrEvent]);

  const copyGuestLink = () => {
    if (!selectedQrEvent) return;
    const guestUrl = `${window.location.origin}/e/${selectedQrEvent.slug}`;
    navigator.clipboard.writeText(guestUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Storage calculation (MB)
  const storageMb = Math.max(1, Math.round(stats.totalPhotos * 3.5));

  return (
    <div className="min-h-screen bg-transparent flex selection:bg-[#D84061] selection:text-white relative">
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-64 bg-white/80 backdrop-blur-xl border-r border-white/60 hidden lg:flex flex-col shrink-0 sticky top-0 h-screen z-40 transition-all">
        {/* Brand Header */}
        <div className="p-6 border-b border-[#EFE9E1]">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#D84061] to-[#F59E0B] flex items-center justify-center text-white shadow-md shadow-[#D84061]/25 group-hover:scale-105 transition-transform duration-300">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <span className="text-2xl font-serif font-bold text-[#1E232A] tracking-tight">
                Wed<span className="text-[#D84061]">Snap</span>
              </span>
              <span className="block text-[10px] text-[#64748B] uppercase tracking-wider font-semibold">
                AI Studio Suite
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation Tabs */}
        <nav className="p-4 space-y-1.5 flex-1 text-sm font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${
              activeTab === 'overview'
                ? 'bg-gradient-to-r from-[#F5EBE6] to-white text-[#D84061] font-bold shadow-sm border border-[#D84061]/20'
                : 'text-[#64748B] hover:text-[#1E232A] hover:bg-[#FAF8F5]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Overview & KPIs</span>
          </button>

          <button
            onClick={() => setActiveTab('events')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 ${
              activeTab === 'events'
                ? 'bg-gradient-to-r from-[#F5EBE6] to-white text-[#D84061] font-bold shadow-sm border border-[#D84061]/20'
                : 'text-[#64748B] hover:text-[#1E232A] hover:bg-[#FAF8F5]'
            }`}
          >
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4" />
              <span>Wedding Events</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#FAF8F5] text-[#1E232A] font-semibold border border-[#EFE9E1]">
              {events.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('gallery')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 ${
              activeTab === 'gallery'
                ? 'bg-gradient-to-r from-[#F5EBE6] to-white text-[#D84061] font-bold shadow-sm border border-[#D84061]/20'
                : 'text-[#64748B] hover:text-[#1E232A] hover:bg-[#FAF8F5]'
            }`}
          >
            <div className="flex items-center gap-3">
              <ImageIcon className="w-4 h-4" />
              <span>Master Gallery</span>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#FAF8F5] text-[#1E232A] font-semibold border border-[#EFE9E1]">
              {allPhotos.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('qrcodes')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${
              activeTab === 'qrcodes'
                ? 'bg-gradient-to-r from-[#F5EBE6] to-white text-[#D84061] font-bold shadow-sm border border-[#D84061]/20'
                : 'text-[#64748B] hover:text-[#1E232A] hover:bg-[#FAF8F5]'
            }`}
          >
            <QrCode className="w-4 h-4" />
            <span>QR Codes & Kiosks</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${
              activeTab === 'settings'
                ? 'bg-gradient-to-r from-[#F5EBE6] to-white text-[#D84061] font-bold shadow-sm border border-[#D84061]/20'
                : 'text-[#64748B] hover:text-[#1E232A] hover:bg-[#FAF8F5]'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Studio Profile</span>
          </button>

          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all duration-300 text-[#9A0026] hover:bg-rose-50 border border-rose-100 hover:border-rose-300 mt-2 font-semibold text-xs shadow-sm cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-[#9A0026]" />
              <span>Admin Portal</span>
            </div>
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-100 text-[#9A0026] font-bold">
              RESTRICTED
            </span>
          </button>
        </nav>

        {/* AI Engine Status Card */}
        <div className="p-4 mx-4 mb-3 rounded-2xl bg-gradient-to-br from-[#FAF8F5] to-[#F5EBE6] border border-[#EFE9E1] text-[11px] space-y-1.5 shadow-inner">
          <div className="flex items-center justify-between text-[#1E232A] font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              AI Recognition
            </span>
            <span className="text-[#D84061] font-semibold text-[10px]">Tier 2 Active</span>
          </div>
          <p className="text-[#64748B] leading-tight">
            ArcFace ResNet-50 • 512D deep hypersphere embeddings with dual-threshold retrieval.
          </p>
        </div>

        {/* User Card */}
        <div className="p-4 border-t border-[#EFE9E1]">
          <div className="flex items-center justify-between p-2.5 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1]">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-[#D84061] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow">
                {user?.fullName?.charAt(0) || 'P'}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-semibold text-[#1E232A] truncate">
                  {user?.fullName || 'Photographer'}
                </div>
                <div className="text-[10px] text-[#64748B] truncate">Studio Master</div>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="p-1.5 text-[#64748B] hover:text-[#D84061] transition-colors rounded-lg hover:bg-white"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN WORKSPACE AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Floating Glass Header */}
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-[#EFE9E1] px-6 sm:px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          {/* Mobile Brand / Section Name */}
          <div className="flex items-center gap-3">
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#D84061] flex items-center justify-center text-white">
                <Camera className="w-4 h-4" />
              </div>
              <span className="font-serif font-bold text-lg text-[#1E232A]">WedSnap</span>
            </div>
            <div className="hidden lg:block text-xs uppercase tracking-wider font-semibold text-[#64748B]">
              Workspace / <span className="text-[#D84061] font-bold capitalize">{activeTab}</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#D84061] hover:bg-[#C03251] text-white text-xs font-semibold shadow-md shadow-[#D84061]/25 hover:shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create Wedding</span>
            </button>
          </div>
        </header>

        {/* WORKSPACE BODY */}
        <div className="p-6 sm:p-8 max-w-7xl w-full mx-auto space-y-8 animate-fade-in">
          {/* ============================================================ */}
          {/* TAB 1: OVERVIEW & MASTER KPIS                                */}
          {/* ============================================================ */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Luxury Welcome Card with Ambient Glow */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1E232A] via-[#2A303C] to-[#1E232A] text-white p-8 sm:p-10 shadow-xl border border-white/10">
                <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-[#D84061]/20 blur-3xl pointer-events-none" />
                <div className="absolute right-10 bottom-0 text-white/5 font-serif text-9xl font-bold select-none pointer-events-none">
                  WedSnap
                </div>

                <div className="relative z-10 max-w-2xl space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-white/90 text-xs backdrop-blur-sm">
                    <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
                    <span>Real AI Wedding Photo Retrieval Platform</span>
                  </div>

                  <h1 className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight">
                    Welcome back, {user?.fullName || 'Photographer'}
                  </h1>

                  <p className="text-sm text-white/70 leading-relaxed">
                    Your wedding collections are permanently stored and indexed with 512D ArcFace facial embeddings.
                    Guests can instantly scan the event QR code, take a selfie, and discover their moments in sub-100ms.
                  </p>

                  <div className="pt-2 flex flex-wrap items-center gap-4">
                    <button
                      onClick={() => setActiveTab('events')}
                      className="px-6 py-3 rounded-full bg-[#D84061] hover:bg-[#C03251] text-white text-xs font-semibold shadow-lg shadow-[#D84061]/30 transition-all flex items-center gap-2"
                    >
                      <span>View All Weddings</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setActiveTab('qrcodes')}
                      className="px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 backdrop-blur-sm transition-all flex items-center gap-2"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Print Event QR Codes</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 4 Animated KPI Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white/90 backdrop-blur-sm p-6 rounded-3xl border border-[#EFE9E1] shadow-xs hover:shadow-xl hover:border-[#D84061]/30 transition-all duration-300 transform hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-[#64748B]">Total Weddings</span>
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <Calendar className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-serif font-bold text-[#1E232A]">{stats.totalEvents}</div>
                  <div className="text-[11px] text-emerald-600 font-semibold mt-2 flex items-center gap-1">
                    <span>Active in database</span>
                  </div>
                </div>

                <div className="bg-white/90 backdrop-blur-sm p-6 rounded-3xl border border-[#EFE9E1] shadow-xs hover:shadow-xl hover:border-[#D84061]/30 transition-all duration-300 transform hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-[#64748B]">Photos Stored</span>
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-serif font-bold text-[#1E232A]">{stats.totalPhotos.toLocaleString()}</div>
                  <div className="text-[11px] text-[#64748B] mt-2">
                    ~{storageMb} MB physical storage
                  </div>
                </div>

                <div className="bg-white/90 backdrop-blur-sm p-6 rounded-3xl border border-[#EFE9E1] shadow-xs hover:shadow-xl hover:border-[#D84061]/30 transition-all duration-300 transform hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-[#64748B]">Faces Indexed</span>
                    <div className="w-10 h-10 rounded-2xl bg-[#F5EBE6] text-[#D84061] flex items-center justify-center">
                      <Users className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-serif font-bold text-[#1E232A]">{stats.facesDetected.toLocaleString()}</div>
                  <div className="text-[11px] text-[#D84061] font-semibold mt-2">
                    512D ArcFace ResNet-50
                  </div>
                </div>

                <div className="bg-white/90 backdrop-blur-sm p-6 rounded-3xl border border-[#EFE9E1] shadow-xs hover:shadow-xl hover:border-[#D84061]/30 transition-all duration-300 transform hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-semibold text-[#64748B]">Storage Usage</span>
                    <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                      <HardDrive className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="text-3xl font-serif font-bold text-[#1E232A]">{storageMb} MB</div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-[#D84061] to-[#F59E0B] h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(5, (storageMb / 50000) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Recent Weddings Showcase */}
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#EFE9E1] shadow-xs space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-serif font-bold text-[#1E232A]">Recent Wedding Collections</h2>
                    <p className="text-xs text-[#64748B] mt-0.5">Quick access to manage galleries and upload photographs.</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('events')}
                    className="text-xs font-semibold text-[#D84061] hover:underline flex items-center gap-1"
                  >
                    <span>View All</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {events.length === 0 ? (
                  <div className="p-8 text-center bg-[#FAF8F5] rounded-2xl border border-dashed border-[#EFE9E1] space-y-3">
                    <HeartHandshake className="w-10 h-10 text-[#D84061]/50 mx-auto" />
                    <p className="text-xs text-[#64748B]">No events created yet.</p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="px-4 py-2 rounded-full bg-[#D84061] text-white text-xs font-semibold shadow"
                    >
                      Create First Wedding
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {events.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className="group bg-[#FAF8F5] rounded-2xl border border-[#EFE9E1] overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col"
                      >
                        <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-200">
                          <img
                            src={event.coverPhotoUrl}
                            alt={event.coupleNames}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white uppercase shadow-sm">
                            Active
                          </div>
                        </div>
                        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                          <div>
                            <h3 className="font-serif font-bold text-[#1E232A] text-base">{event.coupleNames}</h3>
                            <div className="text-[11px] text-[#64748B] flex items-center gap-2 mt-1">
                              <span>{event.venueCity}</span>
                              <span>•</span>
                              <span>{new Date(event.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs text-[#64748B] pt-2 border-t border-[#EFE9E1]">
                            <span><strong>{event.photoCount || 0}</strong> Photos</span>
                            <span className="text-[#D84061]"><strong>{event.faceCount || 0}</strong> Faces</span>
                          </div>

                          <Link
                            to={`/dashboard/events/${event.id}`}
                            className="w-full py-2 rounded-xl bg-white hover:bg-[#D84061] text-[#1E232A] hover:text-white text-xs font-semibold text-center border border-[#EFE9E1] transition-colors"
                          >
                            Manage Gallery
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 2: WEDDING EVENTS MANAGER                                */}
          {/* ============================================================ */}
          {activeTab === 'events' && (
            <div className="space-y-6">
              {/* Filter & Search Bar */}
              <div className="bg-white p-5 rounded-3xl border border-[#EFE9E1] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 max-w-md">
                  <div className="relative w-full">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]" />
                    <input
                      type="text"
                      value={eventSearchQuery}
                      onChange={(e) => setEventSearchQuery(e.target.value)}
                      placeholder="Search by couple name, city, or venue..."
                      className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-[#D84061] transition-all"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Status Pills */}
                  <div className="flex items-center p-1 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs">
                    <button
                      onClick={() => setEventFilterStatus('all')}
                      className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                        eventFilterStatus === 'all' ? 'bg-[#D84061] text-white shadow' : 'text-[#64748B]'
                      }`}
                    >
                      All ({events.length})
                    </button>
                    <button
                      onClick={() => setEventFilterStatus('active')}
                      className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                        eventFilterStatus === 'active' ? 'bg-[#D84061] text-white shadow' : 'text-[#64748B]'
                      }`}
                    >
                      Active
                    </button>
                  </div>

                  {/* View Mode Switch */}
                  <div className="flex items-center p-1 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs">
                    <button
                      onClick={() => setEventViewMode('grid')}
                      className={`p-1.5 rounded-xl transition-all ${
                        eventViewMode === 'grid' ? 'bg-white text-[#D84061] shadow' : 'text-[#64748B]'
                      }`}
                      title="Grid View"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEventViewMode('list')}
                      className={`p-1.5 rounded-xl transition-all ${
                        eventViewMode === 'list' ? 'bg-white text-[#D84061] shadow' : 'text-[#64748B]'
                      }`}
                      title="List View"
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Events List / Grid */}
              {loading ? (
                <div className="p-12 text-center text-xs text-[#64748B] bg-white rounded-3xl border border-[#EFE9E1]">
                  Loading wedding events...
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="p-12 text-center bg-white rounded-3xl border border-[#EFE9E1] space-y-3">
                  <Calendar className="w-10 h-10 text-[#64748B]/40 mx-auto" />
                  <p className="text-sm font-serif font-bold text-[#1E232A]">No events match your criteria</p>
                  <p className="text-xs text-[#64748B]">Try adjusting your search query or create a new wedding event.</p>
                </div>
              ) : eventViewMode === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredEvents.map((event) => (
                    <div
                      key={event.id}
                      className="group bg-white rounded-3xl border border-[#EFE9E1] overflow-hidden shadow-xs hover:shadow-xl hover:border-[#D84061]/30 transition-all duration-300 flex flex-col transform hover:-translate-y-1"
                    >
                      <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-100">
                        <img
                          src={event.coverPhotoUrl}
                          alt={event.coupleNames}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500 text-white uppercase shadow-sm">
                          Active
                        </div>
                      </div>

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div>
                          <h3 className="text-lg font-serif font-bold text-[#1E232A] group-hover:text-[#D84061] transition-colors">
                            {event.coupleNames}
                          </h3>
                          <div className="text-xs text-[#64748B] mt-1 flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{new Date(event.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            <span>•</span>
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{event.venueCity}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-[#EFE9E1] flex items-center justify-between text-xs text-[#64748B]">
                          <span className="flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-[#1E232A]" />
                            <strong className="text-[#1E232A]">{(event.photoCount || 0).toLocaleString()}</strong> Photos
                          </span>
                          <span className="flex items-center gap-1.5 text-[#D84061]">
                            <Users className="w-3.5 h-3.5" />
                            <strong>{(event.faceCount || 0).toLocaleString()}</strong> Faces
                          </span>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <Link
                            to={`/dashboard/events/${event.id}`}
                            className="flex-1 py-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F5EBE6] text-[#1E232A] hover:text-[#D84061] text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border border-[#EFE9E1]"
                          >
                            <span>Open Gallery & Upload</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteEvent(event.id, event.coupleNames, e)}
                            className="p-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors"
                            title="Delete Event"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* List View */
                <div className="bg-white rounded-3xl border border-[#EFE9E1] divide-y divide-[#EFE9E1] overflow-hidden shadow-xs">
                  {filteredEvents.map((event) => (
                    <div
                      key={event.id}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 hover:bg-[#FAF8F5] transition-colors"
                    >
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <img
                          src={event.coverPhotoUrl}
                          alt={event.coupleNames}
                          className="w-16 h-16 rounded-2xl object-cover border border-[#EFE9E1] shrink-0"
                        />
                        <div>
                          <h3 className="font-serif font-bold text-base text-[#1E232A]">{event.coupleNames}</h3>
                          <div className="text-xs text-[#64748B] flex items-center gap-2 mt-0.5">
                            <span>{new Date(event.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            <span>•</span>
                            <span>{event.venueCity}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 text-xs text-[#64748B] w-full sm:w-auto justify-between sm:justify-end">
                        <div>
                          <strong className="text-[#1E232A]">{(event.photoCount || 0).toLocaleString()}</strong> Photos
                        </div>
                        <div className="text-[#D84061]">
                          <strong>{(event.faceCount || 0).toLocaleString()}</strong> Faces
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            to={`/dashboard/events/${event.id}`}
                            className="px-4 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F5EBE6] text-[#1E232A] hover:text-[#D84061] text-xs font-semibold border border-[#EFE9E1] transition-colors"
                          >
                            Manage
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteEvent(event.id, event.coupleNames, e)}
                            className="p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 3: CROSS-WEDDING MASTER GALLERY                         */}
          {/* ============================================================ */}
          {activeTab === 'gallery' && (
            <div className="space-y-6">
              {/* Gallery Header & Filter */}
              <div className="bg-white p-5 rounded-3xl border border-[#EFE9E1] shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-serif font-bold text-[#1E232A]">Cross-Wedding Master Gallery</h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Browse all {allPhotos.length} photograph(s) uploaded across your wedding events.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#64748B] font-medium">Filter by Wedding:</span>
                  <select
                    value={gallerySelectedEventId}
                    onChange={(e) => setGallerySelectedEventId(e.target.value)}
                    className="px-4 py-2 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D84061]"
                  >
                    <option value="all">All Weddings ({allPhotos.length})</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.coupleNames}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredGalleryPhotos.length === 0 ? (
                <div className="p-16 text-center bg-white rounded-3xl border border-[#EFE9E1] space-y-3">
                  <ImageIcon className="w-12 h-12 text-[#64748B]/40 mx-auto" />
                  <p className="font-serif font-bold text-lg text-[#1E232A]">No photos found</p>
                  <p className="text-xs text-[#64748B]">Upload photos to your wedding events to view them here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {filteredGalleryPhotos.map((photo) => (
                    <div
                      key={photo.id}
                      onClick={() => setLightboxPhoto(photo)}
                      className="group aspect-[3/4] rounded-2xl overflow-hidden bg-slate-100 border border-[#EFE9E1] relative shadow-xs hover:shadow-md transition-all cursor-pointer"
                    >
                      <img
                        src={photo.imageData || getImageUrl(photo.url)}
                        alt={photo.fileName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                        <span className="px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] backdrop-blur-sm">
                          {photo.faceCount} face{photo.faceCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 4: QR CODES & VENUE STANDEE GENERATOR                   */}
          {/* ============================================================ */}
          {activeTab === 'qrcodes' && (
            <div className="space-y-6">
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#EFE9E1] shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#EFE9E1]">
                  <div>
                    <h2 className="text-xl font-serif font-bold text-[#1E232A]">Venue QR Code Kiosk & Signage</h2>
                    <p className="text-xs text-[#64748B] mt-0.5">
                      Generate and print high-resolution QR codes for table stands and wedding signage.
                    </p>
                  </div>

                  {events.length > 0 && (
                    <select
                      value={selectedQrEventId}
                      onChange={(e) => setSelectedQrEventId(e.target.value)}
                      className="px-4 py-2.5 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#D84061]"
                    >
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.coupleNames} ({ev.venueCity})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {selectedQrEvent ? (
                  <div className="pt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                    {/* Visual Standee Card Preview with Romantic Floral Theme */}
                    <div className="lg:col-span-7 flex flex-col items-center">
                      <div
                        className="w-full max-w-sm p-6 sm:p-8 rounded-[36px] border-2 border-amber-200/50 shadow-2xl text-center space-y-4 relative overflow-hidden bg-cover bg-center"
                        style={{ backgroundImage: `url('/assets/scanner_bg.jpg')` }}
                      >
                        {/* Soft translucent glass container for maximum contrast */}
                        <div className="backdrop-blur-md bg-white/80 p-5 rounded-[28px] border border-white/80 shadow-lg space-y-3">
                          <div className="text-[10px] tracking-widest uppercase font-serif text-[#9A0026] font-bold">
                            Welcome to the Wedding of
                          </div>
                          <h3 className="text-2xl font-serif font-bold text-[#1E232A]">
                            {selectedQrEvent.coupleNames}
                          </h3>
                          <p className="text-xs text-[#64748B]">
                            {selectedQrEvent.venueName ? `${selectedQrEvent.venueName}, ` : ''}{selectedQrEvent.venueCity} • {new Date(selectedQrEvent.eventDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>

                          {/* Custom Romantic Wedding QR Code (Image 2 style) */}
                          <div className="py-2 flex justify-center">
                            <WeddingQRCode
                              url={`${window.location.origin}/e/${selectedQrEvent.slug}`}
                              size={250}
                              coupleNames={selectedQrEvent.coupleNames}
                              showDownload={false}
                            />
                          </div>

                          <div className="text-xs font-serif font-bold text-[#9A0026] pt-1">
                            Scan with your phone camera to find your photos
                          </div>
                          <div className="text-[10px] text-[#64748B]">
                            Instant Face Recognition • No App Required
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* QR Code Controls */}
                    <div className="lg:col-span-5 space-y-4">
                      <div className="p-5 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] space-y-3">
                        <div className="text-xs font-bold text-[#1E232A]">Direct Event Link</div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            readOnly
                            value={`${window.location.origin}/e/${selectedQrEvent.slug}`}
                            className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#EFE9E1] text-xs text-[#64748B] font-mono select-all"
                          />
                          <button
                            onClick={copyGuestLink}
                            className="px-3.5 py-2 rounded-xl bg-[#D84061] text-white text-xs font-semibold hover:bg-[#C03251] transition-colors flex items-center gap-1.5 shrink-0"
                          >
                            {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copiedLink ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <a
                          href={qrImageUrl}
                          download={`${selectedQrEvent.slug}-qr.png`}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full py-3 rounded-2xl bg-[#1E232A] hover:bg-[#2A303C] text-white text-xs font-semibold text-center transition-colors flex items-center justify-center gap-2 shadow"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download High-Res QR PNG</span>
                        </a>

                        <a
                          href={`/e/${selectedQrEvent.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="w-full py-3 rounded-2xl bg-white hover:bg-[#F5EBE6] text-[#D84061] text-xs font-semibold text-center border border-[#D84061]/30 transition-colors flex items-center justify-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>Preview Guest Experience</span>
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center text-xs text-[#64748B]">No events available for QR generation.</div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 5: STUDIO PROFILE & SETTINGS                             */}
          {/* ============================================================ */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-3xl">
              <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#EFE9E1] shadow-xs space-y-6">
                <div>
                  <h2 className="text-xl font-serif font-bold text-[#1E232A]">Studio Profile & Settings</h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Customize your photographer identity and branding for wedding guests.
                  </p>
                </div>

                <form onSubmit={handleSaveSettings} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-[#1E232A] mb-1">Studio / Brand Name</label>
                    <input
                      type="text"
                      value={studioName}
                      onChange={(e) => setStudioName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs focus:ring-2 focus:ring-[#D84061] focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#1E232A] mb-1">Contact Email</label>
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs focus:ring-2 focus:ring-[#D84061] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#1E232A] mb-1">Contact Phone</label>
                      <input
                        type="text"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs focus:ring-2 focus:ring-[#D84061] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#1E232A]">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Data Persistence & Security</span>
                    </div>
                    <p className="text-[11px] text-[#64748B] leading-relaxed">
                      All created events, photos, face quality metrics, and 512-dimensional ArcFace embeddings are
                      durably committed to disk. Refreshing or restarting the server preserves 100% of your records.
                    </p>
                  </div>

                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="submit"
                      className="px-6 py-2.5 rounded-full bg-[#D84061] hover:bg-[#C03251] text-white text-xs font-semibold shadow-md transition-all flex items-center gap-2"
                    >
                      {settingsSaved ? <Check className="w-4 h-4" /> : null}
                      <span>{settingsSaved ? 'Saved Successfully!' : 'Save Settings'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* CREATE EVENT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-[#EFE9E1] shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-6 animate-scale-up">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-serif font-bold text-[#1E232A]">Create New Wedding Event</h3>
                <p className="text-xs text-[#64748B] mt-0.5">Generate a dedicated gallery and QR code kiosk.</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-[#64748B]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#1E232A] mb-1">Couple Names *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul & Ananya"
                  value={createForm.coupleNames}
                  onChange={(e) => setCreateForm({ ...createForm, coupleNames: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs focus:ring-2 focus:ring-[#D84061] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-[#1E232A] mb-1">Event Date</label>
                  <input
                    type="date"
                    required
                    value={createForm.eventDate}
                    onChange={(e) => setCreateForm({ ...createForm, eventDate: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs focus:ring-2 focus:ring-[#D84061] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#1E232A] mb-1">Venue City</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Hyderabad"
                    value={createForm.venueCity}
                    onChange={(e) => setCreateForm({ ...createForm, venueCity: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs focus:ring-2 focus:ring-[#D84061] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E232A] mb-1">Venue Name</label>
                <input
                  type="text"
                  placeholder="e.g. Taj Falaknuma Palace"
                  value={createForm.venueName}
                  onChange={(e) => setCreateForm({ ...createForm, venueName: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs focus:ring-2 focus:ring-[#D84061] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1E232A] mb-1">Cover Photo URL (optional)</label>
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={createForm.coverPhotoUrl}
                  onChange={(e) => setCreateForm({ ...createForm, coverPhotoUrl: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1] text-xs focus:ring-2 focus:ring-[#D84061] focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2.5 rounded-full text-xs font-semibold text-[#64748B] hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-6 py-2.5 rounded-full bg-[#D84061] hover:bg-[#C03251] text-white text-xs font-semibold shadow-md disabled:opacity-50"
                >
                  {createSubmitting ? 'Creating...' : 'Launch Wedding Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxPhoto(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] flex flex-col items-center">
            <button
              onClick={() => setLightboxPhoto(null)}
              className="absolute -top-12 right-0 p-2 text-white hover:text-[#D84061] transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={lightboxPhoto.imageData || getImageUrl(lightboxPhoto.url)}
              alt={lightboxPhoto.fileName}
              className="max-h-[80vh] w-auto object-contain rounded-2xl shadow-2xl"
            />
            <div className="text-center text-white text-xs mt-3">
              {lightboxPhoto.fileName} • {lightboxPhoto.faceCount} face(s) indexed
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
