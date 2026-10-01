import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Lock, Mail, User, Building, ArrowRight, AlertCircle, Phone } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';

export const RegisterPage: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
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
      const response = await api.post('/auth/register', {
        fullName,
        studioName,
        email,
        phoneNumber,
        password,
      });

      setAuth(response.data.user, response.data.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed. Please check your details.');
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
        <h2 className="text-2xl font-serif font-bold text-[#1E232A]">Create Photographer Account</h2>
        <p className="mt-2 text-sm text-[#64748B]">
          Get started for free. Empower your clients with instant AI face discovery.
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

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-[#1E232A]">Your Full Name</label>
              <div className="mt-1 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Rajesh Kumar"
                  className="block w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] focus:bg-white text-[#1E232A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1E232A]">Photography Studio Name</label>
              <div className="mt-1 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <Building className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={studioName}
                  onChange={(e) => setStudioName(e.target.value)}
                  placeholder="Rajesh Kumar Photography"
                  className="block w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] focus:bg-white text-[#1E232A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1E232A]">Email address</label>
              <div className="mt-1 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rajesh@studio.com"
                  className="block w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] focus:bg-white text-[#1E232A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1E232A]">Phone Number (Optional)</label>
              <div className="mt-1 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="block w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] focus:bg-white text-[#1E232A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1E232A]">Password</label>
              <div className="mt-1 relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#64748B]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] focus:bg-white text-[#1E232A]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3.5 px-4 rounded-xl bg-[#D84061] text-white font-medium hover:bg-[#C03251] transition-all shadow-md shadow-[#D84061]/25 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <span>{loading ? 'Creating Account...' : 'Get Started Free'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-[#64748B]">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-[#D84061] hover:underline">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
