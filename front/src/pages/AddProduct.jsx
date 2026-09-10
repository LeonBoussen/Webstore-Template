import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

const API_BASE = 'http://127.0.0.1:5000'

// Quick single-product form. For full control (services, discounts, multiple
// images, editing) use the Admin panel at /admin instead.
export default function AddProduct() {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [discount, setDiscount] = useState('')
  const [bio, setBio] = useState('')
  const [imageUrls, setImageUrls] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const token = localStorage.getItem('userToken')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setMsg('')
    if (!name.trim() || price === '') {
      setMsg('Name and price are required.')
      return
    }
    const images = imageUrls
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/api/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          price: Number(price),
          discount_price: discount === '' ? null : Number(discount),
          bio: bio.trim(),
          images,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMsg(data?.error || 'Failed to save product')
        return
      }
      navigate('/products')
    } catch {
      setMsg('Network error — is the backend running?')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_10%,rgba(34,197,94,0.08),transparent_60%)]" />
      <div className="max-w-2xl mx-auto px-6 pt-28 pb-16">
        <Link to="/admin" className="text-sm text-neutral-400 hover:text-white transition inline-flex items-center gap-1.5 mb-6">
          ← Back to admin panel
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-transparent bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text mb-2">
          Add product
        </h1>
        <p className="text-sm text-neutral-400 mb-8">
          Quick form for a single product. Use the{' '}
          <Link to="/admin" className="text-cyan-300 hover:underline">admin panel</Link> for services,
          multiple images and editing.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-neutral-900/60 border border-white/10 p-6 shadow-xl backdrop-blur">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Name</label>
            <input
              type="text"
              className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Product name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Price</label>
              <input
                type="number" step="0.01" min="0"
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="e.g. 19.99"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Discount price (optional)</label>
              <input
                type="number" step="0.01" min="0"
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="e.g. 14.99"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">
              Description — <span className="text-neutral-500">Markdown supported</span>
            </label>
            <textarea
              rows={4}
              className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="Describe the product. **bold**, - lists, # headings all work."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">Image URLs (one per line, optional)</label>
            <textarea
              rows={2}
              className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder={'https://example.com/photo1.jpg\nhttps://example.com/photo2.jpg'}
              value={imageUrls}
              onChange={(e) => setImageUrls(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full p-3 rounded-full bg-cyan-600 hover:bg-cyan-500 font-semibold transition disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save product'}
          </button>
          {msg && <p className="text-sm text-neutral-200">{msg}</p>}
        </form>
      </div>
    </div>
  )
}
