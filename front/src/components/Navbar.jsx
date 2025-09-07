import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, LogIn, LogOut, Shield } from 'lucide-react';

const links = [
  { label: 'Home', path: '/' },
  { label: 'Products', path: '/products' },
  { label: 'About', path: '/about' },
  { label: 'Contact', path: '/contact' },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [username] = useState('');
  const [loaded, setLoaded] = useState(false);

  const [scrolled, setScrolled] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const token = typeof window !== 'undefined' ? localStorage.getItem('userToken') : null;
  const isLoggedIn = !!token;
  const isAdmin = username === 'LeonBoussen';

  const isHome = location.pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    setLoaded(true);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [location.pathname]);

  // Lock the page scroll when the sheet is open
  useEffect(() => {
    const cls = 'overflow-hidden';
    const el = document.documentElement;
    if (isOpen) el.classList.add(cls);
    else el.classList.remove(cls);
    return () => el.classList.remove(cls);
  }, [isOpen]);

  const shellClasses = `
    border-b border-white/10 shadow-lg 
    transition-all duration-500 ease-in-out
    ${isHome && !scrolled 
      ? 'bg-transparent opacity-100' 
      : 'bg-neutral-900/70 supports-[backdrop-filter]:bg-neutral-900/40 backdrop-blur-md opacity-100'
    }
  `;
  return (
      <nav
        className={`fixed top-0 inset-x-0 z-50 ${shellClasses}`}
        style={{
          transition: 'background-color 0.5s ease, backdrop-filter 0.5s ease, opacity 0.5s ease'
        }}
        role="navigation"
        aria-label="Primary"
      >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between text-white">
          <Link to="/" className="text-2xl font-bold tracking-wide text-cyan-500 hover:text-cyan-300 transition">
            MangoSoftware
          </Link>

          <div className="hidden md:flex items-center gap-6">
            {links.map(({ label, path }) => (
              <Link
                key={label}
                to={path}
                className="relative after:absolute after:inset-x-0 after:-bottom-1 after:h-[2px] after:w-0 after:bg-cyan-300 after:transition-all hover:after:w-full hover:text-cyan-300 transition">
                {label}
              </Link>
            ))}

            {isAdmin && (
              <Link
                to="/admin"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-cyan-600 hover:bg-cyan-500 transition"
                title="Admin">
                <Shield size={18} /> Admin
              </Link>
            )}

            {!isLoggedIn ? (
              <Link
                to="/login"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-white/20 hover:bg-white hover:text-black transition"
                title="Login">
                <LogIn size={18} /> Login
              </Link>
            ) : (
              <Link
                to="/account"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-neutral-800 hover:bg-neutral-700 transition"
                title="Account">
                Account
              </Link>
            )}
          </div>
          <button
            onClick={() => setIsOpen(v => !v)}
            className="md:hidden text-white hover:text-cyan-300 transition rounded-full p-2 ring-1 ring-white/10 bg-black/20 backdrop-blur-md"
            aria-expanded={isOpen}
            aria-controls="mobile-menu"
            aria-label={isOpen ? 'Close menu' : 'Open menu'}>
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
      <div
        id="mobile-menu"
        className={`md:hidden fixed top-16 inset-x-0 transform transition-all duration-200 ${
          isOpen ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 -translate-y-2'
        }`}
      >
        <div
          className="
            bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 
            border-t border-white/30
            shadow-5xl 
            px-4 pt-3 pb-6 space-y-2
          "
        >
          {links.map(({ label, path }) => (
            <Link
              key={label}
              to={path}
              className="block w-full py-2 px-3 rounded-lg text-white hover:bg-cyan-600 hover:text-white transition font-medium"
            >
              {label}
            </Link>
          ))}

          {isAdmin && (
            <Link
              to="/admin"
              className="block w-full py-2 px-3 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition font-medium"
            >
              <span className="inline-flex items-center gap-2">
                <Shield size={18} /> Admin
              </span>
            </Link>
          )}

          {!isLoggedIn ? (
            <Link
              to="/login"
              className="block w-full py-2 px-3 rounded-lg border border-white/20 text-white hover:bg-white hover:text-black transition font-medium"
            >
              <span className="inline-flex items-center gap-2">
                <LogIn size={18} /> Login
              </span>
            </Link>
          ) : (
            <Link
              to="/account"
              className="block w-full py-2 px-3 rounded-lg bg-neutral-800 text-white hover:bg-neutral-700 transition font-medium"
            >
              <span className="inline-flex items-center gap-2">Account</span>
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
