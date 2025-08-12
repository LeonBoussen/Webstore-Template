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

function App() {
  return (
    <Router>
        <Navbar />
          {/* Offset for fixed navbar */}
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/products" element={<Products />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/addproduct" element={<AddProduct />} />
              {/* NEW routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/admin" element={<Admin />} />

              <Route path="*" element={<div className="p-6">Page Not Found Bozo :(</div>} />
            </Routes>
          {/* Removed the global white filler div */}
    </Router>
  );
}

export default App;
