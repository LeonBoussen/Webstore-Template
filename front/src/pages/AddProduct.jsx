import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'

const AddProduct = () => {
  const [name, setName]       = useState('')
  const [price, setPrice]     = useState('')
  const [image, setImage]     = useState('')
  const navigate              = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()

    // 1. Build payload
    const payload = { name, price, image }

    try {
      // 2. Send POST to your backend
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/api/products`, 
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      )

      if (!res.ok) {
        const err = await res.json()
        console.error('Failed:', err)
        return alert(err.error || 'Failed to save product')
      }

      // 3. On success, redirect to Products
      navigate('/products')
    } catch (err) {
      console.error('Error:', err)
      alert('Error saving product')
    }
  }

  return (
    <>
      <Navbar />
      <div className="pt-16 min-h-screen bg-white p-8 text-black">
        <h1 className="text-3xl font-bold mb-6">Add Product</h1>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          <input
            type="text"
            placeholder="Product Name"
            className="w-full border rounded px-4 py-2"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <input
            type="number"
            step="0.01"
            placeholder="Price"
            className="w-full border rounded px-4 py-2"
            value={price}
            onChange={e => setPrice(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Image URL"
            className="w-full border rounded px-4 py-2"
            value={image}
            onChange={e => setImage(e.target.value)}
          />
          <button
            type="submit"
            className="bg-cyan-600 text-white px-4 py-2 rounded hover:bg-cyan-700"
          >
            Save Product
          </button>
        </form>
      </div>
    </>
  )
}

export default AddProduct
