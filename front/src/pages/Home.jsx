import { useEffect, useState } from 'react';
import axios from 'axios';

const Home = () => {
  const [upPhrase, setUpPhrase] = useState('');
  const [downPhrase, setDownPhrase] = useState('');
  const [loaded, setLoaded] = useState(false);

  // NEW: simple showcase items (replace with your real products/services or API data)
  const topItems = [
    { title: 'Starter Bundle', desc: 'Perfect for getting going fast with our essentials.', href: '/products' , badge: 'Popular' },
    { title: 'Pro Service', desc: 'Priority support and extended features for teams.', href: '/products', badge: 'Bestseller' },
    { title: 'Custom Build', desc: 'Tailored solutions for unique requirements.', href: '/products' },
    { title: 'Maintenance', desc: 'Performance tuning and long-term reliability.', href: '/services' },
    { title: 'Security Review', desc: 'Hardening, audits, and best-practice guidance.', href: '/services' },
    { title: 'Consulting', desc: 'From roadmap to rollout with expert help.', href: '/contact' }
  ];

  useEffect(() => {
    const fetchCatchphrase = async () => {
      try {
        const response = await axios.get('http://127.0.0.1:5000/api/catchphrase');
        setUpPhrase(response.data.upphrase);
        setDownPhrase(response.data.downphrase);
        setLoaded(true);
      } catch (error) {
        console.error('Error fetching catchphrase:', error);
      }
    };
    fetchCatchphrase();
  }, []);

  return (
    <div className="flex flex-col bg-neutral-950 text-white">
      {/* KEEP: gradient pulse for the hero headline */}
      <style>
        {`
          @keyframes gradientPulse {
            0% { background-position: 0% 50%; }
            25% { background-position: 100% 0%; }
            50% { background-position: 100% 100%; }
            75% { background-position: 0% 100%; }
            100% { background-position: 0% 50%; }
          }
          .animate-gradient-pulse {
            background-size: 400% 400%;
            animation: gradientPulse 10s ease-in-out infinite;
          }
        `}
      </style>

      {/* HERO (unchanged layout) https://images.unsplash.com/photo-1729575846511-f499d2e17d79?q=80&w=1632&auto=format&fit=crop*/}
      <div className="relative min-h-screen w-full flex items-center justify-center bg-cover bg-center mt-0 bg-[url('https://images.unsplash.com/photo-1729575846511-f499d2e17d79?q=80&w=1632&auto=format&fit=crop')]">
        <div className="absolute inset-0 bg-black/60" />
        <div
          className={`relative z-10 text-center px-6 transition-opacity duration-1000 ease-in-out ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="text-4xl md:text-6xl font-bold text-transparent bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text animate-gradient-pulse drop-shadow-lg mb-6">
            <p>{upPhrase}</p>
            <p>{downPhrase}</p>
          </div>

          {/* CHANGED: buttons now scroll to sections on this page */}
          <div className="flex flex-wrap gap-4 justify-center mt-6">
            <a
              href="#top-products"
              className="px-6 py-3 rounded-full bg-cyan-500 text-white font-semibold shadow-lg hover:shadow-cyan-500/50 hover:bg-cyan-400 transition-all"
            >
              Explore Products
            </a>
            <a
              href="#about"
              className="px-6 py-3 rounded-full border border-white text-white font-semibold hover:bg-white hover:text-black transition-all"
            >
              Learn More
            </a>
          </div>
        </div>
      </div>

      {/* NEW: Top Products / Services */}
      <section
        id="top-products"
        className="relative w-full py-16 md:py-20 bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950"
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-end justify-between gap-4 mb-8">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
              Top Products <span className="text-neutral-400">/</span> Services
            </h2>
            <a
              href="/products"
              className="text-sm underline underline-offset-4 decoration-cyan-400 hover:opacity-90"
            >
              View all →
            </a>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {topItems.map((item, i) => (
              <div
                key={i}
                className="group relative rounded-2xl bg-neutral-900/60 border border-white/10 p-5 hover:border-cyan-500/40 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  {item.badge && (
                    <span className="text-[10px] uppercase tracking-wide bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-neutral-300">
                  {item.desc}
                </p>
                <a
                  href={item.href}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-cyan-300 hover:text-white"
                  aria-label={`Open ${item.title}`}
                >
                  View details
                  <svg width="16" height="16" viewBox="0 0 24 24" className="inline">
                    <path fill="currentColor" d="M13 5l7 7-7 7v-4H4v-6h9V5z" />
                  </svg>
                </a>
                <div className="pointer-events-none absolute inset-0 rounded-2xl ring-0 ring-cyan-400/0 group-hover:ring-2 group-hover:ring-cyan-400/30 transition" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NEW: About / Who we are */}
      <section id="about" className="w-full py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-6 grid md:grid-cols-2 gap-10 items-start">
          <div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Built with care. Shipped with intent.</h2>
            <p className="mt-4 text-neutral-300">
              We design and deliver reliable, privacy-conscious tech—products and services that
              put real users first. From fast starts to long-term scale, we focus on clean design,
              strong security, and measurable outcomes.
            </p>
            <p className="mt-3 text-neutral-300">
              Whether you’re launching something new or leveling up an existing stack, our goal is
              simple: <span className="text-white">make it work beautifully</span>—and keep it secure.
            </p>
          </div>

          <div className="grid gap-4">
            {[
              'Privacy-first by default',
              'Performance and reliability',
              'Security best practices baked in',
              'Honest roadmaps & clear pricing'
            ].map((point, i) => (
              <div key={i} className="flex items-start gap-3">
                <svg width="20" height="20" viewBox="0 0 24 24" className="mt-1 flex-none">
                  <path fill="currentColor" d="M9 16.2l-3.5-3.6L4 14l5 5 11-11-1.5-1.4z" />
                </svg>
                <span className="text-neutral-200">{point}</span>
              </div>
            ))}
            <div className="mt-2 text-sm text-neutral-400">
              Serving startups, creators, and SMBs that care about quality and trust.
            </div>
          </div>
        </div>
      </section>

      {/* NEW: Footer */}
      <footer className="mt-8 border-t border-white/10 bg-neutral-950">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-sm text-neutral-400">
            © {new Date().getFullYear()} YourBrand. All rights reserved.{' '}
            <span className="mx-2">•</span>
            <a href="/legal" className="hover:text-white">Legal</a>
            <span className="mx-2">•</span>
            <a href="/privacy" className="hover:text-white">Privacy</a>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://x.com/yourbrand" aria-label="X" className="hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M4 4l7.5 8.5L4 20h3l6-6.7L19.5 20H22l-7.7-8.5L22 4h-3L13 10.6L7.5 4z"/></svg>
            </a>
            <a href="https://instagram.com/yourbrand" aria-label="Instagram" className="hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7m5 3.8A5.2 5.2 0 1 1 6.8 13 5.2 5.2 0 0 1 12 7.8m0 2A3.2 3.2 0 1 0 15.2 13 3.2 3.2 0 0 0 12 9.8M17.5 6a1 1 0 1 1-1 1a1 1 0 0 1 1-1Z"/></svg>
            </a>
            <a href="https://github.com/yourbrand" aria-label="GitHub" className="hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.8c-2.9.6-3.5-1.4-3.5-1.4c-.5-1.2-1.2-1.6-1.2-1.6c-1-.7.1-.7.1-.7c1.1.1 1.7 1.2 1.7 1.2c1 .1.8-.8.8-.8c-.9-.1-1.8-.5-2.2-1.1c-.2-.5-.6-1.6.1-2.2c0 0 .8-.1 2 .8c.7-.2 1.5-.3 2.3-.3s1.6.1 2.3.3c1.2-.9 2-.8 2-.8c.7.6.3 1.7.1 2.2c-.4.6-1.3 1-2.2 1.1c0 0-.2.9.8.8c0 0 .6-1.1 1.7-1.2c0 0 1.1 0 .1.7c0 0-.7.4-1.2 1.6c0 0-.6 2.1-3.5 1.4v1.8c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>
            </a>
            <a href="https://linkedin.com/company/yourbrand" aria-label="LinkedIn" className="hover:text-white">
              <svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M6.94 6.5A2.44 2.44 0 1 1 4.5 4.06A2.44 2.44 0 0 1 6.94 6.5M4.75 8.5h4.38V20H4.75Zm7.13 0h4.2v1.58h.06a4.6 4.6 0 0 1 4.14-2.27c4.43 0 5.24 2.92 5.24 6.7V20H21.5v-5.45c0-1.3 0-3-1.83-3s-2.1 1.42-2.1 2.9V20H13.5Z"/></svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
