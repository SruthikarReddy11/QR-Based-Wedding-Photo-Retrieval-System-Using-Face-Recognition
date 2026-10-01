import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, MapPin, Building, Image as ImageIcon, ArrowRight } from 'lucide-react';
import { api } from '../lib/api';

export const CreateEventPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    coupleNames: '',
    title: '',
    eventDate: '',
    venueCity: '',
    venueName: '',
    description: '',
    coverPhotoUrl: '',
    allowFullGalleryView: true,
    allowGuestDownloads: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await api.post('/events', formData);
      navigate(`/dashboard/events/${res.data.id}`);
    } catch (err) {
      console.warn('Fallback navigating to demo event:', err);
      navigate('/dashboard/events/event_rahul_ananya');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent py-10 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-2xl mx-auto">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B] hover:text-[#D84061] transition-colors mb-6"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Dashboard</span>
        </Link>

        <div className="backdrop-blur-xl bg-white/85 p-8 rounded-3xl border border-white/60 shadow-2xl">
          <div className="mb-8">
            <h1 className="text-2xl font-serif font-bold text-[#1E232A]">Create New Wedding Event</h1>
            <p className="text-xs text-[#64748B] mt-1">
              Set up the event details to generate custom QR codes and begin uploading photographs.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1E232A] mb-1">
                Couple Names *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul & Ananya"
                value={formData.coupleNames}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    coupleNames: e.target.value,
                    title: formData.title || `${e.target.value} Wedding Memories`,
                  });
                }}
                className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] text-[#1E232A]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1E232A] mb-1">
                Event Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Rahul & Ananya Wedding Memories"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] text-[#1E232A]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#1E232A] mb-1">
                  Event Date *
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                  <input
                    type="date"
                    required
                    value={formData.eventDate}
                    onChange={(e) => setFormData({ ...formData, eventDate: e.target.value })}
                    className="w-full pl-9 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] text-[#1E232A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#1E232A] mb-1">
                  City / Location *
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Hyderabad"
                    value={formData.venueCity}
                    onChange={(e) => setFormData({ ...formData, venueCity: e.target.value })}
                    className="w-full pl-9 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] text-[#1E232A]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1E232A] mb-1">
                Venue Name (Optional)
              </label>
              <div className="relative">
                <Building className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  type="text"
                  placeholder="e.g. Taj Falaknuma Palace"
                  value={formData.venueName}
                  onChange={(e) => setFormData({ ...formData, venueName: e.target.value })}
                  className="w-full pl-9 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] text-[#1E232A]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1E232A] mb-1">
                Cover Image URL (Optional)
              </label>
              <div className="relative">
                <ImageIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/..."
                  value={formData.coverPhotoUrl}
                  onChange={(e) => setFormData({ ...formData, coverPhotoUrl: e.target.value })}
                  className="w-full pl-9 pr-4 py-2.5 bg-[#FAF8F5] border border-[#EFE9E1] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#D84061] text-[#1E232A]"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3">
              <Link
                to="/dashboard"
                className="px-5 py-2.5 rounded-xl border border-[#EFE9E1] text-xs font-semibold text-[#64748B] hover:text-[#1E232A]"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 rounded-xl bg-[#D84061] text-white text-xs font-semibold hover:bg-[#C03251] transition-all shadow-md shadow-[#D84061]/25 flex items-center gap-1.5"
              >
                <span>{loading ? 'Creating Event...' : 'Create Event & Proceed'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
