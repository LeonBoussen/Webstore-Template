import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const AddProduct = () => {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [image, setImage] = useState('')
  const navigate = useNavigate()

  const handleSubmit = (e) => {
    e.preventDefault()
    console.log({ name, price, image }) // later send to backend
    navigate('/products') // redirect after submit
  }

  return (
    <div className="min-h-screen bg-white p-8 text-black">
      <h1 className="text-3xl font-bold mb-6">Add Product</h1>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <input
          type="text"
          placeholder="Product Name"
          className="w-full border rounded px-4 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Price"
          className="w-full border rounded px-4 py-2"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
        <input
          type="text"
          placeholder="Image URL"
          className="w-full border rounded px-4 py-2"
          value={image}
          onChange={(e) => setImage(e.target.value)}
        />
        <button
          type="submit"
          className="bg-cyan-600 text-white px-4 py-2 rounded hover:bg-cyan-700"
        >
          Save
        </button>
      </form>
    </div>
  )
}

export default AddProduct
