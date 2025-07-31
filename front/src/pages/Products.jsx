import React, { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import { Link } from 'react-router-dom'

const Products = () => {
  const [products, setProducts] = useState([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/products`)
      .then(res => res.json())
      .then(data => setProducts(data))
      .catch(err => console.error('Failed to load products', err))
  }, [])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <>
      <Navbar />
      <div className="pt-16 bg-gray-100 min-h-screen">
        <div className="container mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">Products</h1>

          {/* Search Bar */}
          <div className="flex mb-6">
            <input
              type="text"
              placeholder="Search products..."
              className="flex-grow border border-gray-300 rounded-l px-4 py-2 focus:outline-none"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <button className="bg-blue-600 text-white px-4 rounded-r hover:bg-blue-700">
              Search
            </button>
          </div>

          {/* Products Grid */}
          {filtered.length === 0 ? (
            <p className="text-center text-gray-600">No products to display.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filtered.map(product => (
                <div key={product.id} className="bg-white p-4 rounded-lg shadow hover:shadow-md flex flex-col">
                  {product.image_url && (
                    <Link to={`/products/${product.id}`}>
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-40 w-full object-cover rounded mb-4"
                      />
                    </Link>
                  )}
                  <h2 className="text-xl font-semibold mb-2 flex-grow">
                    {product.name}
                  </h2>
                  <div className="mb-2">
                    <span className="text-lg font-bold">€{product.price}</span>
                    {product.discount_price && (
                      <span className="text-red-500 line-through ml-2">
                        €{product.discount_price}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 mb-4">
                    {product.limited_edition && (
                      <span className="px-2 py-1 bg-yellow-200 text-yellow-800 text-sm rounded">Limited</span>
                    )}
                    {product.sold_out && (
                      <span className="px-2 py-1 bg-gray-200 text-gray-600 text-sm rounded">Sold Out</span>
                    )}
                  </div>
                  <button
                    className="mt-auto bg-green-600 text-white py-2 rounded hover:bg-green-700 disabled:bg-gray-400"
                    disabled={product.sold_out}
                  >
                    {product.sold_out ? 'Unavailable' : 'Add to Cart'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default Products
