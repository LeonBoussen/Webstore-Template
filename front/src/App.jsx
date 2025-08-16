import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Products from './pages/Products';
import About from './pages/About';
import Contact from './pages/Contact';
import AddProduct from './pages/AddProduct';

import Login from './pages/Login';
import Signup from './pages/Signup';
import Admin from './pages/Admin';
import Account from './pages/Account'
import ProductDetails from './pages/ProductDetails';

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
            <Route path="/admin" element={<Admin />} />
            <Route path="/account" element={<Account />} />

            <Route path="*" element={<div className="p-6">This page is not here, contact the developer!</div>} />
          </Routes>
    </Router>
  );
}

export default App;
