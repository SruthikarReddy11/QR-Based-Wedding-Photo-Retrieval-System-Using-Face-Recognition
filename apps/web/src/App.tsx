import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { CreateEventPage } from './pages/CreateEventPage';
import { EventDetailPage } from './pages/EventDetailPage';
import { GuestEventPage } from './pages/GuestEventPage';
import { AdminPortalPage } from './pages/AdminPortalPage';
import { useAuthStore } from './stores/authStore';

export const App: React.FC = () => {
  const { initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <div
      className="min-h-screen w-full relative bg-cover bg-center bg-fixed text-[#1E232A]"
      style={{ backgroundImage: `url('/assets/scanner_bg.jpg')` }}
    >
      {/* Global Ambient Overlay ensuring warm tone and perfect contrast */}
      <div className="fixed inset-0 bg-[#FAF8F5]/70 backdrop-blur-[1px] pointer-events-none z-0" />

      {/* Content Layer */}
      <div className="relative z-10 min-h-screen">
        <Router>
          <Routes>
            {/* Public Marketing */}
            <Route path="/" element={<LandingPage />} />

            {/* Authentication */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Photographer SaaS Dashboard */}
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard/events" element={<DashboardPage />} />
            <Route path="/dashboard/events/create" element={<CreateEventPage />} />
            <Route path="/dashboard/events/:id" element={<EventDetailPage />} />

            {/* Guest Mobile Experience */}
            <Route path="/e/:slug" element={<GuestEventPage />} />

            {/* Master Admin Portal */}
            <Route path="/admin" element={<AdminPortalPage />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </div>
    </div>
  );
};

export default App;
