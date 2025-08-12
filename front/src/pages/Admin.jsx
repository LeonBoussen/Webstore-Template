import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:5000' });

export default function Admin() {
  const [allowed, setAllowed] = useState(null); // null = loading
  const [msg, setMsg] = useState('');

  // NEW: missing state added
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);

  const [draftP, setDraftP] = useState({});
  const [draftS, setDraftS] = useState({});

  const token = localStorage.getItem('userToken');
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  // access check (kept)
  useEffect(() => {
    const check = async () => {
      if (!token) { setAllowed(false); setMsg('Please log in.'); return; }
      try {
        const meRes = await fetch('http://localhost:5000/api/auth/me', { headers: authHeader });
        if (!meRes.ok) throw new Error('me failed');
        const me = await meRes.json();
        if (me.username === 'LeonBoussen') setAllowed(true);
        else { setAllowed(false); setMsg('Admin access is restricted.'); }
      } catch {
        setAllowed(false);
        setMsg('Session expired. Please log in again.');
      }
    };
    check();
  }, [token]);

  // load initial lists when allowed
  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed]);

  const load = async () => {
    const [p, s] = await Promise.all([
      api.get('/api/products'),
      api.get('/api/services')
    ]);
    setProducts(p.data);
    setServices(s.data);
  };

  // helpers
  const uploadImage = async (file) => {
    const form = new FormData();
    form.append('image', file);
    const { data } = await api.post('/api/upload/image', form, {
      headers: { ...authHeader, 'Content-Type': 'multipart/form-data' }
    });
    return data.image_url;
  };

  const saveProduct = async (item) => {
    if (!item.name || item.price === undefined || item.price === null) {
      alert('Name and price are required'); return;
    }
    if (item.id) {
      await api.put(`/api/products/${item.id}`, item, { headers: authHeader });
    } else {
      const { data } = await api.post(`/api/products`, item, { headers: authHeader });
      item.id = data.id;
      setDraftP({});
    }
    await load();
  };

  const deleteProduct = async (id) => {
    await api.delete(`/api/products/${id}`, { headers: authHeader });
    await load();
  };

  const saveService = async (item) => {
    if (!item.name || item.price === undefined || item.price === null) {
      alert('Name and price are required'); return;
    }
    if (item.id) {
      await api.put(`/api/services/${item.id}`, item, { headers: authHeader });
    } else {
      const { data } = await api.post(`/api/services`, item, { headers: authHeader });
      item.id = data.id;
      setDraftS({});
    }
    await load();
  };

  const deleteService = async (id) => {
    await api.delete(`/api/services/${id}`, { headers: authHeader });
    await load();
  };

  if (allowed === null) {
    return <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">Checking access…</div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-2">Access denied</h1>
          <p className="text-neutral-300">{msg}</p>
          <div className="mt-4">
            <Link className="underline underline-offset-4 decoration-cyan-400" to="/login">Go to Login</Link>
          </div>
        </div>
      </div>
    );
  }

  const ItemEditor = ({ item, onChange, onSave, onDelete, type }) => (
    <div className="rounded-xl border border-white/10 p-4 bg-neutral-900/60">
      <div className="grid md:grid-cols-2 gap-3">
        <input className="p-2 rounded bg-neutral-800 border border-white/10" placeholder="Name"
          value={item.name || ''} onChange={e=>onChange({...item, name:e.target.value})} />
        <input className="p-2 rounded bg-neutral-800 border border-white/10" placeholder="Price"
          type="number" step="0.01" value={item.price ?? ''} onChange={e=>onChange({...item, price: e.target.value ? parseFloat(e.target.value) : ''})} />
        <input className="p-2 rounded bg-neutral-800 border border-white/10" placeholder="Discount price (optional)"
          type="number" step="0.01" value={item.discount_price ?? ''} onChange={e=>onChange({...item, discount_price: e.target.value ? parseFloat(e.target.value): null})} />
        <input className="p-2 rounded bg-neutral-800 border border-white/10" placeholder="Image URL"
          value={item.image_url || ''} onChange={e=>onChange({...item, image_url:e.target.value})} />
      </div>
      <textarea className="mt-3 w-full p-2 rounded bg-neutral-800 border border-white/10" rows="3" placeholder="Bio / description"
        value={item.bio || ''} onChange={e=>onChange({...item, bio:e.target.value})}/>
      <div className="mt-3 flex items-center gap-2">
        {type === 'product' && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!item.limited_edition} onChange={e=>onChange({...item, limited_edition: e.target.checked ? 1 : 0})}/>
              Limited edition
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!item.sold_out} onChange={e=>onChange({...item, sold_out: e.target.checked ? 1 : 0})}/>
              Sold out
            </label>
          </>
        )}
        {type === 'service' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={item.active ?? 1} onChange={e=>onChange({...item, active: e.target.checked ? 1 : 0})}/>
            Active
          </label>
        )}
        <input type="file" accept="image/*" onChange={async (e)=>{
          const file = e.target.files?.[0]; if(!file) return;
          const url = await uploadImage(file);
          onChange({...item, image_url: url});
        }}/>
        <button className="ml-auto px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-500" onClick={()=>onSave(item)}>Save</button>
        {item.id && <button className="px-3 py-2 rounded bg-red-600 hover:bg-red-500" onClick={()=>onDelete(item.id)}>Delete</button>}
      </div>
    </div>
  );

  const handleLogout = () => {
    localStorage.removeItem('userToken');
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <button className={`px-3 py-2 rounded ${tab==='products'?'bg-cyan-600':'bg-neutral-800'}`} onClick={()=>setTab('products')}>Products</button>
          <button className={`px-3 py-2 rounded ${tab==='services'?'bg-cyan-600':'bg-neutral-800'}`} onClick={()=>setTab('services')}>Services</button>
          <button className="ml-auto px-3 py-2 rounded bg-neutral-800" onClick={handleLogout}>Logout</button>
        </div>

        {tab==='products' && (
          <>
            <h2 className="text-xl font-semibold mb-3">Add Product</h2>
            <ItemEditor type="product" item={draftP} onChange={setDraftP} onSave={saveProduct} onDelete={()=>{}} />
            <h2 className="text-xl font-semibold mt-8 mb-3">All Products</h2>
            <div className="grid gap-3">
              {products.map(p => (
                <ItemEditor key={p.id} type="product" item={p} onChange={(upd)=>{
                  setProducts(products.map(x=>x.id===p.id?upd:x));
                }} onSave={saveProduct} onDelete={deleteProduct}/>
              ))}
            </div>
          </>
        )}

        {tab==='services' && (
          <>
            <h2 className="text-xl font-semibold mb-3">Add Service</h2>
            <ItemEditor type="service" item={draftS} onChange={setDraftS} onSave={saveService} onDelete={()=>{}} />
            <h2 className="text-xl font-semibold mt-8 mb-3">All Services</h2>
            <div className="grid gap-3">
              {services.map(s => (
                <ItemEditor key={s.id} type="service" item={s} onChange={(upd)=>{
                  setServices(services.map(x=>x.id===s.id?upd:x));
                }} onSave={saveService} onDelete={deleteService}/>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
