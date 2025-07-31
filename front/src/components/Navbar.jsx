import { Link } from 'react-router-dom'

const links = [
  { label: 'Home',     path: '/' },
  { label: 'Products', path: '/products' },
  { label: 'About',    path: '/about' },
  { label: 'Contact',  path: '/contact' },
]

const Navbar = () => (
  <nav className="fixed top-0 left-0 w-full flex justify-center gap-8 py-4 bg-black/40 backdrop-blur-sm text-white shadow-md z-50">
    {links.map(({ label, path }) => (
      <Link
        key={label}
        to={path}
        className="hover:text-cyan-300 hover:drop-shadow-[0_0_20px_cyan] transition"
      >
        {label}
      </Link>
    ))}
  </nav>
)

export default Navbar
