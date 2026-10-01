import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Sparkles, ArrowRight, User as UserIcon, LogOut } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

export const Navbar: React.FC = () => {
  const { isAuthenticated, logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-[#EFE9E1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#D84061] to-[#E96884] flex items-center justify-center text-white shadow-md shadow-[#D84061]/20 group-hover:scale-105 transition-transform">
            <Camera className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-serif font-bold tracking-tight text-[#1E232A]">
              Wed<span className="text-[#D84061]">Snap</span>
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#64748B]">
          <Link to="/" className="hover:text-[#D84061] transition-colors">Home</Link>
          <a href="#how-it-works" className="hover:text-[#D84061] transition-colors">How It Works</a>
          <a href="#for-photographers" className="hover:text-[#D84061] transition-colors">For Photographers</a>
          <Link to="/e/rahul-ananya" className="hover:text-[#D84061] flex items-center gap-1.5 text-[#D84061] font-semibold">
            <Sparkles className="w-4 h-4" /> Guest Live Demo
          </Link>
        </nav>

        {/* Auth CTA Actions */}
        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <Link
                to="/dashboard"
                className="px-4 py-2.5 rounded-full bg-[#1E232A] text-white text-sm font-medium hover:bg-black transition-colors flex items-center gap-2 shadow-sm"
              >
                <UserIcon className="w-4 h-4" />
                <span>Dashboard</span>
              </Link>
              <button
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                className="p-2 text-[#64748B] hover:text-[#D84061] transition-colors"
                title="Log Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                to="/login"
                className="px-4 py-2 text-sm font-medium text-[#1E232A] hover:text-[#D84061] transition-colors"
              >
                Log In
              </Link>
              <Link
                to="/register"
                className="px-5 py-2.5 rounded-full bg-[#D84061] text-white text-sm font-medium hover:bg-[#C03251] transition-all shadow-md shadow-[#D84061]/25 flex items-center gap-1.5 hover:gap-2.5"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
