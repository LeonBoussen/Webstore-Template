import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react'; // install: npm i lucide-react

const links = [
  { label: 'Home', path: '/' },
  { label: 'Products', path: '/products' },
  { label: 'About', path: '/about' },
  { label: 'Contact', path: '/contact' },
];

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 w-full bg-black/40 backdrop-blur-md text-white shadow-lg z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0 text-2xl font-bold tracking-wide hover:text-cyan-300 transition">
            <Link to="/">MyBrand</Link>
          </div>

          {/* Desktop Links */}
          <div className="hidden md:flex gap-6">
            {links.map(({ label, path }) => (
              <Link
                key={label}
                to={path}
                className="relative after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[2px] after:bg-cyan-300 after:transition-all hover:after:w-full hover:text-cyan-300 transition"
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-white hover:text-cyan-300 transition"
              aria-label="Toggle menu"
            >
              {isOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {isOpen && (
        <div className="md:hidden bg-black/80 backdrop-blur-md px-4 pt-2 pb-4 space-y-2 shadow-lg">
          {links.map(({ label, path }) => (
            <Link
              key={label}
              to={path}
              className="block py-2 px-3 rounded hover:bg-cyan-500/20 transition"
              onClick={() => setIsOpen(false)}
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
