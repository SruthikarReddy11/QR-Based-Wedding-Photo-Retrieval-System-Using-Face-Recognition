import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      setAuth(response.data.user, response.data.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link to="/" className="inline-flex items-center gap-2 mb-4 group">
          <div className="w-10 h-10 rounded-xl bg-[#D84061] flex items-center justify-center text-white shadow-md shadow-[#D84061]/25">
            <Camera className="w-5 h-5" />
          </div>
          <span className="text-3xl font-serif font-bold text-[#1E232A]">
            Wed<span className="text-[#D84061]">Snap</span>
          </span>
        </Link>
        <h2 className="text-2xl font-serif font-bold text-[#1E232A]">Photographer Login</h2>
        <p className="mt-2 text-sm text-[#64748B]">
          Sign in to manage your wedding events, upload photos, and view guest retrieval analytics.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="backdrop-blur-xl bg-white/85 py-8 px-6 sm:px-10 shadow-2xl rounded-3xl border border-white/60">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-[#1E232A]">Email address</label>
              <div className="mt-1.5 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="photographer@studio.com"
                  className="block w-full pl-11 pr-4 py-3 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] focus:bg-white transition-all text-[#1E232A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1E232A]">Password</label>
              <div className="mt-1.5 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-11 pr-4 py-3 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] focus:bg-white transition-all text-[#1E232A]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-[#D84061] text-white font-medium hover:bg-[#C03251] transition-all shadow-md shadow-[#D84061]/25 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? 'Signing in...' : 'Sign in'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-[#64748B]">
            Don't have an account yet?{' '}
            <Link to="/register" className="font-semibold text-[#D84061] hover:underline">
              Create Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
