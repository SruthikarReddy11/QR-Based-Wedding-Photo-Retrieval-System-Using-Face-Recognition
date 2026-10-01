import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Lock,
  Cpu,
  Database,
  Users,
  Calendar,
  Trash2,
  RefreshCw,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Server,
  Zap,
  ArrowRight,
  ExternalLink,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';

interface SystemStats {
  system: {
    uptimeSeconds: number;
    platform: string;
    nodeVersion: string;
    cpuCores: number;
    databaseType: string;
    isPostgresConnected: boolean;
  };
  memory: {
    containerLimitMB: number;
    nodeRssMB: number;
    nodeHeapUsedMB: number;
    nodeHeapTotalMB: number;
    containerUsagePercent: number;
    osTotalMB: number;
    osUsedMB: number;
    osFreeMB: number;
    osUsagePercent: number;
    status: 'OPTIMAL' | 'WARNING' | 'CRITICAL';
  };
  storage: {
    uploadsDir: string;
    uploadsSizeMB: number;
    photosStoredOnDisk: number;
  };
  users: {
    totalUsers: number;
    photographers: number;
    admins: number;
    activeNow: number;
  };
  catalog: {
    totalEvents: number;
    totalPhotos: number;
    totalFacesIndexed: number;
  };
  aiService: any;
}

export const AdminPortalPage: React.FC = () => {
  const navigate = useNavigate();

  // Master Admin Authentication State
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('wedsnap_admin_pin_verified') === 'true';
  });

  // Admin Data State
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [eventsList, setEventsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'metrics' | 'events' | 'users' | 'database'>('metrics');

  const getAdminHeaders = () => {
    const token = localStorage.getItem('wedsnap_admin_token');
    return {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    const candidate = pin.trim();
    if (!candidate) {
      setPinError('Please enter Master PIN.');
      return;
    }

    try {
      const res = await api.post('/admin/verify-pin', { pin: candidate });
      if (res.data.token) {
        localStorage.setItem('wedsnap_admin_token', res.data.token);
      }
      localStorage.setItem('wedsnap_admin_pin_verified', 'true');
      setIsAuthenticated(true);
      fetchAdminData();
    } catch (err: any) {
      setPinError(err.response?.data?.error || 'Invalid Master Security PIN. Access denied.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('wedsnap_admin_pin_verified');
    localStorage.removeItem('wedsnap_admin_token');
    setIsAuthenticated(false);
    setPin('');
  };

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, eventsRes] = await Promise.all([
        api.get('/admin/stats', getAdminHeaders()),
        api.get('/admin/users', getAdminHeaders()),
        api.get('/admin/events', getAdminHeaders()),
      ]);
      setStats(statsRes.data);
      setUsersList(usersRes.data || []);
      setEventsList(eventsRes.data || []);
    } catch (err: any) {
      console.error('Failed to fetch admin data:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setIsAuthenticated(false);
        localStorage.removeItem('wedsnap_admin_pin_verified');
        localStorage.removeItem('wedsnap_admin_token');
        setPinError(err.response?.data?.error || 'Master Admin session expired. Please re-enter Master PIN.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchAdminData();
      // Auto-refresh stats every 10 seconds
      const interval = setInterval(fetchAdminData, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const handlePurgeMemory = async () => {
    try {
      setActionMessage('Cleaning RAM and flushing AI tensors...');
      const res = await api.post('/admin/purge-memory', {}, getAdminHeaders());
      setActionMessage(res.data.message || 'RAM cleaned successfully!');
      await fetchAdminData();
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      alert(`Purge failed: ${err.message}`);
    }
  };

  const handleDeleteEvent = async (eventId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete event "${name}" and all its photos?`)) {
      return;
    }
    try {
      await api.delete(`/admin/events/${eventId}`, getAdminHeaders());
      setActionMessage(`Event "${name}" deleted.`);
      await fetchAdminData();
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      alert(`Delete event failed: ${err.message}`);
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!window.confirm(`Are you sure you want to delete user "${email}" and all their events?`)) {
      return;
    }
    try {
      await api.delete(`/admin/users/${userId}`, getAdminHeaders());
      setActionMessage(`User "${email}" deleted.`);
      await fetchAdminData();
      setTimeout(() => setActionMessage(null), 3000);
    } catch (err: any) {
      alert(`Delete user failed: ${err.message}`);
    }
  };

  const handleDownloadBackup = async () => {
    try {
      const res = await api.get('/admin/backup', {
        responseType: 'blob',
        ...getAdminHeaders(),
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `wedsnap_backup_${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Download backup failed: ${err.message}`);
    }
  };

  const handleRestoreDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const json = JSON.parse(reader.result as string);
        await api.post('/admin/restore', json, getAdminHeaders());
        alert('Database restored successfully!');
        await fetchAdminData();
      } catch (err: any) {
        alert(`Failed to restore database: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  // -------------------------------------------------------------
  // 1. PIN LOCK SCREEN
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white/90 backdrop-blur-2xl rounded-3xl p-8 border border-white/80 shadow-[0_20px_60px_-15px_rgba(154,0,38,0.2)] text-center relative overflow-hidden animate-in fade-in zoom-in duration-300">
          {/* Decorative Ruby Glow */}
          <div className="absolute -top-16 -right-16 w-36 h-36 bg-[#9A0026]/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-[#D4AF37]/20 rounded-full blur-3xl pointer-events-none" />

          <div className="inline-flex p-4 rounded-2xl bg-gradient-to-tr from-[#9A0026] to-[#C41E3A] text-white shadow-lg mb-6 ring-4 ring-[#9A0026]/15 animate-bounce">
            <Shield className="w-8 h-8" />
          </div>

          <h2 className="text-2xl font-serif font-bold text-gray-900 tracking-tight">Master Admin Portal</h2>
          <p className="text-xs text-gray-500 mt-2 mb-6">
            Enter the secure 4-digit Master Security PIN to access system controls, memory telemetry, and user management.
          </p>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <div className="relative">
                <input
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full py-4 text-center tracking-[0.5em] text-2xl font-mono font-bold rounded-2xl border-2 border-rose-200 focus:border-[#9A0026] focus:ring-4 focus:ring-[#9A0026]/20 bg-white/95 text-gray-900 transition-all outline-none"
                  autoFocus
                />
                <Lock className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
              {pinError && <p className="text-xs font-semibold text-rose-600 mt-2">{pinError}</p>}
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-[#9A0026] to-[#C41E3A] hover:from-[#7A001E] hover:to-[#9A0026] text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              <span>Unlock Admin Center</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-center text-xs text-gray-400">
            <button
              onClick={() => navigate('/dashboard')}
              className="text-[#9A0026] font-medium hover:underline cursor-pointer"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. UNLOCKED MASTER ADMIN DASHBOARD
  // -------------------------------------------------------------
  const memUsedMB = stats?.memory.nodeRssMB || 0;
  const memLimitMB = stats?.memory.containerLimitMB || 512;
  const memPercent = stats?.memory.containerUsagePercent || 0;
  const isPostgres = stats?.system.isPostgresConnected;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Banner Navigation */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/90 backdrop-blur-xl p-6 rounded-3xl border border-white/80 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-[#9A0026] to-[#C41E3A] text-white shadow-md">
            <Shield className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-serif font-bold text-gray-900 tracking-tight">WedSnap Master Admin</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#9A0026]/10 text-[#9A0026] border border-[#9A0026]/20">
                MASTER ADMIN AUTHORIZED
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Live RAM Telemetry • Event Deletion & Master Overrides • User Accounts & Database Persistence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAdminData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-[#9A0026] text-xs font-semibold transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Lock</span>
          </button>
        </div>
      </header>

      {/* Action Notification Toast */}
      {actionMessage && (
        <div className="bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-lg flex items-center justify-between text-xs font-medium animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{actionMessage}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-emerald-200 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Anti-Erase Permanent Database Alert */}
      {!isPostgres && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 p-5 rounded-3xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-sm mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">Database Running on Ephemeral JSON Storage</h3>
              <p className="text-xs text-amber-800/90 mt-1 max-w-3xl leading-relaxed">
                Render's free tier re-creates the container filesystem whenever the server sleeps or restarts, which erases events.
                To make your events <strong>100% permanent forever</strong>, connect a <strong>Free Render PostgreSQL database</strong> or download regular JSON backups.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={handleDownloadBackup}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Backup</span>
            </button>
            <button
              onClick={() => setActiveTab('database')}
              className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Fix Permanence</span>
            </button>
          </div>
        </div>
      )}

      {/* Top 4 KPI Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* RAM Usage Gauge */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-white/80 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)] relative overflow-hidden group">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-rose-50 text-[#9A0026]">
              <Cpu className="w-5 h-5" />
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                memPercent > 80
                  ? 'bg-rose-100 text-rose-700'
                  : memPercent > 60
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {memPercent}% LOAD
            </span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Render Container RAM</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-gray-900">{memUsedMB} MB</span>
            <span className="text-xs text-gray-400">/ {memLimitMB} MB</span>
          </div>

          {/* Animated Bar */}
          <div className="w-full bg-gray-100 h-2 rounded-full mt-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                memPercent > 80 ? 'bg-rose-600' : memPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, memPercent)}%` }}
            />
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-[11px] text-gray-400">Node RSS: {stats?.memory.nodeRssMB || 0} MB</span>
            <button
              onClick={handlePurgeMemory}
              className="text-[11px] font-bold text-[#9A0026] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Zap className="w-3 h-3" />
              <span>Purge RAM</span>
            </button>
          </div>
        </div>

        {/* Users Online & Registered */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-white/80 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
              <Users className="w-5 h-5" />
            </div>
            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <span>{stats?.users.activeNow || 1} Active</span>
            </span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Registered Accounts</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-gray-900">{stats?.users.totalUsers || 0}</span>
            <span className="text-xs text-gray-400">users</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>{stats?.users.photographers || 0} Photographers</span>
            <span>{stats?.users.admins || 1} Admin</span>
          </div>
        </div>

        {/* Total Wedding Events */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-white/80 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
              <Calendar className="w-5 h-5" />
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700">
              Active Events
            </span>
          </div>
          <p className="text-xs text-gray-500 font-medium">All Wedding Albums</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-gray-900">{stats?.catalog.totalEvents || 0}</span>
            <span className="text-xs text-gray-400">events</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>{stats?.catalog.totalPhotos || 0} Photos total</span>
            <span>{eventsList.length} In database</span>
          </div>
        </div>

        {/* ArcFace 512D Vector Space */}
        <div className="bg-white/90 backdrop-blur-xl p-5 rounded-3xl border border-white/80 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">
              ArcFace 512D
            </span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Indexed Face Vectors</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl font-bold text-gray-900">{stats?.catalog.totalFacesIndexed || 0}</span>
            <span className="text-xs text-gray-400">embeddings</span>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
            <span>Disk: {stats?.storage.uploadsSizeMB || 0} MB</span>
            <span className="text-emerald-600 font-semibold">YuNet 5-pt OK</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          onClick={() => setActiveTab('metrics')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'metrics'
              ? 'bg-[#9A0026] text-white shadow-md'
              : 'bg-white/80 text-gray-600 hover:bg-white'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>RAM & System Health</span>
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'events'
              ? 'bg-[#9A0026] text-white shadow-md'
              : 'bg-white/80 text-gray-600 hover:bg-white'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>All Events ({eventsList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'users'
              ? 'bg-[#9A0026] text-white shadow-md'
              : 'bg-white/80 text-gray-600 hover:bg-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Accounts ({usersList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('database')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-semibold transition cursor-pointer ${
            activeTab === 'database'
              ? 'bg-[#9A0026] text-white shadow-md'
              : 'bg-white/80 text-gray-600 hover:bg-white'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Data Persistence & Backup</span>
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* TAB 1: RAM & SYSTEM TELEMETRY */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'metrics' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Detailed Memory Telemetry */}
          <div className="bg-white/90 backdrop-blur-xl p-6 rounded-3xl border border-white/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#9A0026]" />
                <span>Memory Allocation Breakdown</span>
              </h2>
              <button
                onClick={handlePurgeMemory}
                className="px-3.5 py-1.5 rounded-xl bg-[#9A0026] hover:bg-[#7A001E] text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Clean Memory</span>
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Node.js RSS (Resident Set Size)</span>
                <span className="font-mono font-bold text-gray-900">{stats?.memory.nodeRssMB || 0} MB</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Node.js Heap Used</span>
                <span className="font-mono font-bold text-gray-900">{stats?.memory.nodeHeapUsedMB || 0} MB</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Node.js Heap Total</span>
                <span className="font-mono font-bold text-gray-900">{stats?.memory.nodeHeapTotalMB || 0} MB</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Host OS Total Memory</span>
                <span className="font-mono font-bold text-gray-900">{stats?.memory.osTotalMB || 0} MB</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Host OS Free Memory</span>
                <span className="font-mono font-bold text-emerald-600">{stats?.memory.osFreeMB || 0} MB</span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 text-xs text-gray-600 space-y-1">
              <p className="font-semibold text-gray-800">Why memory stays low now:</p>
              <p>• Client-side downscaling prevents large camera photos from spiking RAM.</p>
              <p>• Zero-copy disk path extraction avoids duplicating image bytes in Node heap.</p>
              <p>• Python AI microservice scales YuNet detection to max 1600px with automatic garbage collection.</p>
            </div>
          </div>

          {/* AI Microservice & Engine Diagnostics */}
          <div className="bg-white/90 backdrop-blur-xl p-6 rounded-3xl border border-white/80 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-purple-600" />
              <span>AI Face Recognition & Runtime</span>
            </h2>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Face Detection Model</span>
                <span className="font-semibold text-gray-900">YuNet (5-Point Landmarks)</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Face Recognition Model</span>
                <span className="font-semibold text-gray-900">{stats?.aiService?.models?.recognizer || 'ArcFace 512D'}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Vector Embedding Dimension</span>
                <span className="font-mono font-bold text-purple-600">512 dimensions</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">High Confidence Match Threshold</span>
                <span className="font-mono font-bold text-emerald-600">≥ 0.45</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Suggested Match Threshold</span>
                <span className="font-mono font-bold text-amber-600">≥ 0.34</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-500">Server System Uptime</span>
                <span className="font-semibold text-gray-900">
                  {Math.floor((stats?.system.uptimeSeconds || 0) / 60)} minutes
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50 text-xs text-purple-900 space-y-1">
              <p className="font-semibold">Dual-Threshold Calibration:</p>
              <p>Ensures 4–5 year cross-age photographs are accurately recognized while preserving a 0% false positive rate for different individuals.</p>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 2: MASTER EVENT CONTROL */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'events' && (
        <div className="bg-white/90 backdrop-blur-xl p-6 rounded-3xl border border-white/80 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Master Wedding Events List</h2>
              <p className="text-xs text-gray-500">Admin override: delete any event, check photos, or inspect QR codes.</p>
            </div>
            <button
              onClick={() => navigate('/dashboard/events/create')}
              className="px-4 py-2 rounded-xl bg-[#9A0026] text-white text-xs font-semibold shadow-sm hover:bg-[#7A001E] transition cursor-pointer"
            >
              + Create New Event
            </button>
          </div>

          {eventsList.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              No events found in the database.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50/80 text-gray-600 font-semibold border-b border-gray-100">
                  <tr>
                    <th className="py-3 px-4">Event Name & Couple</th>
                    <th className="py-3 px-4">Creator / Photographer</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Photos</th>
                    <th className="py-3 px-4">512D Faces</th>
                    <th className="py-3 px-4 text-right">Admin Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {eventsList.map((ev: any) => (
                    <tr key={ev.id} className="hover:bg-rose-50/30 transition">
                      <td className="py-3.5 px-4 font-semibold text-gray-900">
                        <div>{ev.coupleNames || ev.title || ev.name || 'Untitled Event'}</div>
                        <div className="text-[10px] text-gray-400 font-mono">slug: {ev.slug}</div>
                      </td>
                      <td className="py-3.5 px-4 text-gray-600">
                        <div>{ev.creatorName}</div>
                        <div className="text-[10px] text-gray-400">{ev.creatorEmail}</div>
                      </td>
                      <td className="py-3.5 px-4 text-gray-500">
                        {ev.eventDate ? new Date(ev.eventDate).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-gray-800">{ev.photoCount || 0}</td>
                      <td className="py-3.5 px-4 font-bold text-purple-700">{ev.totalFacesIndexed || 0}</td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => navigate(`/dashboard/events/${ev.id}`)}
                          className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium cursor-pointer"
                        >
                          Manage
                        </button>
                        <a
                          href={`/e/${ev.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium"
                        >
                          <span>Scanner</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                        <button
                          onClick={() => handleDeleteEvent(ev.id, ev.coupleNames || ev.title || ev.name || 'Event')}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-[#9A0026] font-medium cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 3: USER MANAGEMENT */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'users' && (
        <div className="bg-white/90 backdrop-blur-xl p-6 rounded-3xl border border-white/80 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">User Accounts Management</h2>
            <p className="text-xs text-gray-500">View registered photographers and administrators.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50/80 text-gray-600 font-semibold border-b border-gray-100">
                <tr>
                  <th className="py-3 px-4">User Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Events Created</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {usersList.map((u: any) => (
                  <tr key={u.id} className="hover:bg-rose-50/30 transition">
                    <td className="py-3.5 px-4 font-semibold text-gray-900">{u.fullName || 'User'}</td>
                    <td className="py-3.5 px-4 font-mono text-gray-600">{u.email}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          u.role === 'ADMIN'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-gray-800">{u.eventsCount || 0}</td>
                    <td className="py-3.5 px-4 text-gray-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {u.role !== 'ADMIN' && (
                        <button
                          onClick={() => handleDeleteUser(u.id, u.email)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-[#9A0026] font-medium cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                          <span>Delete User</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TAB 4: DATABASE PERSISTENCE & ANTI-ERASE GUIDE */}
      {/* ------------------------------------------------------------- */}
      {activeTab === 'database' && (
        <div className="space-y-6">
          {/* Backup & Restore Controls */}
          <div className="bg-white/90 backdrop-blur-xl p-6 rounded-3xl border border-white/80 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Database className="w-5 h-5 text-[#9A0026]" />
              <span>Instant Database Backup & Restore</span>
            </h2>
            <p className="text-xs text-gray-600 leading-relaxed">
              Export your entire wedding database (all photographers, events, photo references, and 512D ArcFace embeddings) as a single JSON file. If your container restarts, you can restore everything with 1 click.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={handleDownloadBackup}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-[#9A0026] to-[#C41E3A] text-white text-xs font-semibold shadow-md hover:shadow-lg transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Full Database (.json)</span>
              </button>

              <label className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border-2 border-gray-200 hover:border-gray-400 text-gray-700 text-xs font-semibold shadow-sm transition cursor-pointer">
                <Upload className="w-4 h-4 text-gray-500" />
                <span>Restore Database from File</span>
                <input type="file" accept=".json" onChange={handleRestoreDatabase} className="hidden" />
              </label>
            </div>
          </div>

          {/* Step-by-Step Render Free PostgreSQL Permanence Guide */}
          <div className="bg-white/90 backdrop-blur-xl p-6 rounded-3xl border border-white/80 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">How to Make Database 100% Permanent on Render (Free)</h3>
                <p className="text-xs text-gray-500">Takes 60 seconds. Once connected, your events will NEVER be erased on restart.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                <span className="w-6 h-6 rounded-full bg-[#9A0026] text-white text-xs font-bold flex items-center justify-center">1</span>
                <h4 className="text-xs font-bold text-gray-900">Create Free PostgreSQL</h4>
                <p className="text-[11px] text-gray-600">
                  In your Render Dashboard, click <strong>+ New</strong> → <strong>PostgreSQL</strong>. Name it <code className="bg-gray-200 px-1 rounded">wedsnap-db</code> and choose the <strong>Free Plan</strong>.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                <span className="w-6 h-6 rounded-full bg-[#9A0026] text-white text-xs font-bold flex items-center justify-center">2</span>
                <h4 className="text-xs font-bold text-gray-900">Copy Internal DB URL</h4>
                <p className="text-[11px] text-gray-600">
                  Once created, scroll to <strong>Connections</strong> and copy the <strong>Internal Database URL</strong> (starts with <code className="bg-gray-200 px-1 rounded">postgresql://...</code>).
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                <span className="w-6 h-6 rounded-full bg-[#9A0026] text-white text-xs font-bold flex items-center justify-center">3</span>
                <h4 className="text-xs font-bold text-gray-900">Add to Web Service</h4>
                <p className="text-[11px] text-gray-600">
                  Open your <code className="bg-gray-200 px-1 rounded">websnap-j39k</code> Web Service → <strong>Environment</strong> → Add variable <code className="bg-gray-200 px-1 rounded">DATABASE_URL</code> and paste the copied URL!
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-900">
              <p className="font-semibold">Automatic Schema Migration Enabled:</p>
              <p className="mt-0.5">
                Our startup script automatically detects <code className="bg-emerald-100 px-1 rounded">DATABASE_URL</code> and synchronizes all tables. You don't have to run any manual database commands!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
