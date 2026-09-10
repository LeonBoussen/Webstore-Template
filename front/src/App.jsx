import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Products from './pages/Products';
import About from './pages/About';
import Contact from './pages/Contact';
import AddProduct from './pages/AddProduct';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Setup from './pages/Setup';
import Admin from './pages/Admin';
import Account from './pages/Account'
import ProductDetails from './pages/ProductDetails';
import Checkout from './pages/Checkout';

function App() {
  return (
    <Router>
        <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/product/:id" element={<ProductDetails />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/addproduct" element={<AddProduct />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/account" element={<Account />} />
            <Route path="/checkout" element={<Checkout/>} />

            <Route path="*" element={
              <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6 pt-16">
                <div className="text-center max-w-md">
                  <p className="text-7xl font-bold tracking-tight text-transparent bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text mb-3">404</p>
                  <h1 className="text-xl font-semibold mb-2">This page is not here</h1>
                  <p className="text-neutral-400 text-sm mb-6">
                    The page you were looking for was moved, renamed, or never existed.
                  </p>
                  <Link
                    to="/"
                    className="inline-block px-6 py-3 rounded-full bg-white text-neutral-900 font-semibold hover:bg-neutral-200 transition"
                  >
                    Back to home
                  </Link>
                </div>
              </div>
            } />
          </Routes>
    </Router>
  );
}

export default App;
