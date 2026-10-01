import React from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { QrCode, Camera, Sparkles, ShieldCheck, ArrowRight, Play, Heart, Zap, Users } from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-transparent text-[#1E232A]">
      <Navbar />

      {/* Hero Section matching reference image */}
      <section className="relative overflow-hidden pt-12 pb-24 lg:pt-20 lg:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Left Content Column */}
            <div className="lg:col-span-7 space-y-8">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F5EBE6] text-[#D84061] text-xs font-semibold tracking-wide uppercase border border-[#EFE9E1]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Next-Gen Wedding Photography AI</span>
              </div>

              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-serif font-bold tracking-tight text-[#1E232A] leading-[1.1]">
                Find Every{' '}
                <span className="text-[#D84061] underline decoration-[#F5EBE6] decoration-wavy">
                  Moment You
                </span>{' '}
                Were Part Of
              </h1>

              <p className="text-lg sm:text-xl text-[#64748B] max-w-2xl leading-relaxed font-normal">
                AI-powered wedding photo discovery for photographers and their guests. Simply scan a QR code, take a selfie, and find all your moments from the special day.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <Link
                  to="/register"
                  className="px-8 py-4 rounded-full bg-[#D84061] text-white font-medium hover:bg-[#C03251] transition-all shadow-lg shadow-[#D84061]/25 flex items-center gap-2.5 text-base hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>Get Started Free</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>

                <Link
                  to="/e/rahul-ananya"
                  className="px-8 py-4 rounded-full bg-white text-[#1E232A] border border-[#EFE9E1] font-medium hover:border-[#D84061] hover:text-[#D84061] transition-all flex items-center gap-2 text-base shadow-sm"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>See How It Works (Live Demo)</span>
                </Link>
              </div>

              {/* Social Proof Proof Metrics */}
              <div className="grid grid-cols-3 gap-6 pt-10 border-t border-[#EFE9E1]/80 max-w-lg">
                <div>
                  <div className="text-3xl font-serif font-bold text-[#1E232A]">10K+</div>
                  <div className="text-xs sm:text-sm text-[#64748B] mt-1 font-medium">Weddings Covered</div>
                </div>
                <div>
                  <div className="text-3xl font-serif font-bold text-[#1E232A]">5M+</div>
                  <div className="text-xs sm:text-sm text-[#64748B] mt-1 font-medium">Photos Processed</div>
                </div>
                <div>
                  <div className="text-3xl font-serif font-bold text-[#1E232A]">100K+</div>
                  <div className="text-xs sm:text-sm text-[#64748B] mt-1 font-medium">Happy Guests</div>
                </div>
              </div>
            </div>

            {/* Right Visual Image Mockup Column */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                {/* Main Hero Indian Wedding Picture */}
                <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white/80 aspect-[4/5] group">
                  <img
                    src="https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1000&q=80"
                    alt="Indian Wedding Couple"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6 text-white">
                    <div className="text-xs uppercase tracking-widest text-[#FAF8F5]/80 font-medium">Live Event</div>
                    <div className="text-2xl font-serif font-semibold mt-0.5">Rahul & Ananya</div>
                    <div className="text-xs text-[#FAF8F5]/70 mt-1 flex items-center gap-2">
                      <span>12 October 2026</span>
                      <span>•</span>
                      <span>Hyderabad</span>
                    </div>
                  </div>
                </div>

                {/* Floating Polaroid 1 */}
                <div className="absolute -bottom-6 -left-8 bg-white p-3.5 rounded-2xl shadow-xl border border-[#EFE9E1] rotate-[-6deg] hidden sm:block w-48">
                  <div className="aspect-[4/3] rounded-lg overflow-hidden mb-2">
                    <img
                      src="https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=400&q=80"
                      alt="Wedding candid"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-[11px] font-serif text-center text-[#1E232A] font-medium flex items-center justify-center gap-1">
                    <Heart className="w-3 h-3 text-[#D84061] fill-current" />
                    <span>Your Moments Forever</span>
                  </div>
                </div>

                {/* Floating Polaroid 2 */}
                <div className="absolute -top-6 -right-6 bg-white p-3 rounded-2xl shadow-xl border border-[#EFE9E1] rotate-[8deg] hidden sm:block w-44">
                  <div className="aspect-square rounded-lg overflow-hidden mb-2">
                    <img
                      src="https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=400&q=80"
                      alt="Guest moments"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="text-[10px] text-center text-[#64748B] font-medium">
                    127 Photos Found ✨
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 3-Step "How It Works" Section */}
      <section id="how-it-works" className="py-24 bg-white border-y border-[#EFE9E1]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <span className="text-xs uppercase tracking-widest text-[#D84061] font-semibold">Effortless Guest Experience</span>
            <h2 className="text-3xl sm:text-5xl font-serif font-bold text-[#1E232A]">
              How WedSnap Works for Guests
            </h2>
            <p className="text-base sm:text-lg text-[#64748B]">
              No app store downloads. No account creation. No password hassles. Guests discover their wedding memories in seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16">
            {/* Step 1 */}
            <div className="bg-[#FAF8F5] rounded-3xl p-8 border border-[#EFE9E1] relative group hover:shadow-lg transition-all">
              <div className="text-6xl font-serif font-black text-[#F5EBE6] group-hover:text-[#D84061]/20 transition-colors">
                01
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-[#D84061] mt-4 mb-6 border border-[#EFE9E1]">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-serif font-semibold text-[#1E232A]">Scan the QR Code</h3>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">
                Guests scan the custom branded QR code standee placed on reception tables using their phone's native camera.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-[#FAF8F5] rounded-3xl p-8 border border-[#EFE9E1] relative group hover:shadow-lg transition-all">
              <div className="text-6xl font-serif font-black text-[#F5EBE6] group-hover:text-[#D84061]/20 transition-colors">
                02
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-[#D84061] mt-4 mb-6 border border-[#EFE9E1]">
                <Camera className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-serif font-semibold text-[#1E232A]">Take an Instant Selfie</h3>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">
                The mobile web page opens instantly. With one tap, guests snap a quick selfie. The selfie is processed ephemeral in memory and never stored permanently.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-[#FAF8F5] rounded-3xl p-8 border border-[#EFE9E1] relative group hover:shadow-lg transition-all">
              <div className="text-6xl font-serif font-black text-[#F5EBE6] group-hover:text-[#D84061]/20 transition-colors">
                03
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-[#D84061] mt-4 mb-6 border border-[#EFE9E1]">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-serif font-semibold text-[#1E232A]">Find All Your Photos</h3>
              <p className="text-sm text-[#64748B] mt-2 leading-relaxed">
                Our AI vector engine matches the guest across 10,000+ wedding photos in under 2 seconds. View, download full-res originals, or share directly to WhatsApp.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* For Photographers Section */}
      <section id="for-photographers" className="py-24 bg-white/40 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            <div className="lg:col-span-6 space-y-6">
              <span className="text-xs uppercase tracking-widest text-[#D84061] font-semibold">For Wedding Photographers</span>
              <h2 className="text-3xl sm:text-5xl font-serif font-bold text-[#1E232A] leading-tight">
                Turn Every Wedding Into Your Best Marketing Engine
              </h2>
              <p className="text-base sm:text-lg text-[#64748B] leading-relaxed">
                Stop emailing expiring Google Drive and WeTransfer links. Delight your couples and impress hundreds of wedding guests with an instant AI gallery that puts your studio brand front and center.
              </p>

              <div className="space-y-4 pt-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#F5EBE6] text-[#D84061] flex items-center justify-center shrink-0 mt-1">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-[#1E232A]">Direct High-Volume Uploads</h4>
                    <p className="text-sm text-[#64748B]">Drag and drop 10,000+ high-res photos. Uploads stream directly to Cloudflare R2 storage without server freezing.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#F5EBE6] text-[#D84061] flex items-center justify-center shrink-0 mt-1">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-[#1E232A]">Strict Event & Privacy Isolation</h4>
                    <p className="text-sm text-[#64748B]">Zero risk of cross-wedding leakage. Vectors and photos are isolated strictly to that individual event.</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#F5EBE6] text-[#D84061] flex items-center justify-center shrink-0 mt-1">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-[#1E232A]">Viral Lead Generation</h4>
                    <p className="text-sm text-[#64748B]">When 500 guests download their photos, your studio watermarks and contact badge generate organic client referrals.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#1E232A] text-white font-medium hover:bg-black transition-colors"
                >
                  <span>Create Photographer Account</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6 bg-white p-8 rounded-3xl border border-[#EFE9E1] shadow-xl">
              <div className="flex items-center justify-between pb-6 border-b border-[#EFE9E1]">
                <div>
                  <div className="text-xs text-[#64748B]">Live Event Dashboard</div>
                  <div className="text-xl font-serif font-bold text-[#1E232A] mt-0.5">Rahul & Ananya Wedding</div>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  LIVE
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 my-6">
                <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1]">
                  <div className="text-2xl font-bold text-[#1E232A]">8,452</div>
                  <div className="text-xs text-[#64748B] mt-1">Photos Indexed</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1]">
                  <div className="text-2xl font-bold text-[#1E232A]">6,913</div>
                  <div className="text-xs text-[#64748B] mt-1">Faces Detected</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1]">
                  <div className="text-2xl font-bold text-[#1E232A]">1,248</div>
                  <div className="text-xs text-[#64748B] mt-1">Guest QR Scans</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#EFE9E1]">
                  <div className="text-2xl font-bold text-[#1E232A]">992</div>
                  <div className="text-xs text-[#64748B] mt-1">Unique Visitors</div>
                </div>
              </div>

              <Link
                to="/dashboard"
                className="w-full py-3 rounded-xl bg-[#F5EBE6] text-[#D84061] text-sm font-semibold hover:bg-[#ebdcd3] transition-colors flex items-center justify-center gap-2"
              >
                <span>View Full Photographer Demo</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-[#EFE9E1] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#D84061] flex items-center justify-center text-white">
              <Camera className="w-4 h-4" />
            </div>
            <span className="text-xl font-serif font-bold text-[#1E232A]">
              Wed<span className="text-[#D84061]">Snap</span>
            </span>
          </div>

          <div className="text-sm text-[#64748B]">
            © {new Date().getFullYear()} WedSnap Technologies. Built exclusively for wedding photo discovery.
          </div>

          <div className="flex items-center gap-6 text-sm text-[#64748B]">
            <Link to="/e/rahul-ananya" className="hover:text-[#D84061]">Guest Demo</Link>
            <Link to="/login" className="hover:text-[#D84061]">Photographer Login</Link>
            <Link to="/register" className="hover:text-[#D84061]">Register Free</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
