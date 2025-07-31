import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Products from './pages/Products'
import About from './pages/About'
import Contact from './pages/Contact'
import AddProduct from './pages/AddProduct'


function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/addproduct" element={<AddProduct />} />
        <Route path="*" element={<div className="fixed">Page Not Found Bozo :(</div>} />
      </Routes>

      {/* Scrollable Section after Hero */}
      <div className="bg-white min-h-[200vh] p-10 text-black">
      </div>
    </Router>
  )
}

export default App
