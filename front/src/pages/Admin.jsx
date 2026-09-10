import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { Plus, Save, Trash2, Search, LogOut, ShieldCheck } from "lucide-react";

const API_BASE = "http://127.0.0.1:5000";
const api = axios.create({ baseURL: API_BASE });

function useAuth() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('userToken') : null;
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  return { token, headers };
}

function cx(...cls) { return cls.filter(Boolean).join(' '); }

function toNumberOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeOut(item) {
  return {
    ...item,
    price: toNumberOrNull(item.price),
    discount_price: toNumberOrNull(item.discount_price),
    images: Array.isArray(item.images) ? item.images : [],
    limited_edition: item.limited_edition ? 1 : 0,
    sold_out: item.sold_out ? 1 : 0,
    active: item.active ? 1 : 0,
  };
}

function createDraft(type) {
  return type === 'product'
    ? { name: '', bio: '', price: '', discount_price: '', images: [], limited_edition: 0, sold_out: 0 }
    : { name: '', bio: '', price: '', discount_price: '', images: [], active: 1 };
}

// Admin previews both uploaded (relative /static/...) and remote image URLs.
function imgSrc(src) {
  if (!src) return null;
  return /^https?:\/\//i.test(src) ? src : `${API_BASE}${src}`;
}

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const money = (v) => (v === null || v === undefined || v === '' ? null : euro.format(Number(v)));

export default function Admin() {
  const navigate = useNavigate();
  const { token, headers } = useAuth();
  const [allowed, setAllowed] = useState(null);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState('products');
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [draftP, setDraftP] = useState(() => createDraft('product'));
  const [draftS, setDraftS] = useState(() => createDraft('service'));
  const [draftEpoch, setDraftEpoch] = useState(0);

  const say = (text) => { setToast(text); };

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // --- Access check (admin rights come from the account role) ---
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) { alive && setAllowed(false); alive && setMsg('Please log in.'); return; }
      try {
        const meRes = await fetch(`${API_BASE}/api/auth/me`, { headers });
        if (!meRes.ok) throw new Error('me failed');
        const me = await meRes.json();
        // The temporary setup admin must create its own account first.
        if (alive && me.setup_pending === true) { navigate('/setup'); return; }
        if (alive) setAllowed(me.role === 'admin');
        if (alive && me.role !== 'admin') setMsg('Admin access is restricted.');
      } catch {
        if (!alive) return;
        setAllowed(false);
        setMsg('Session expired. Please log in again.');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, navigate]);

  useEffect(() => { if (allowed) refresh(); }, [allowed]);

  async function refresh() {
    const [p, s] = await Promise.all([
      api.get('/api/products'),
      api.get('/api/services'),
    ]);
    // Expect server to provide .images (array) and legacy .image_url (string)
    const coerce = (x) => ({
      ...x,
      images: Array.isArray(x.images) ? x.images : (x.image_url ? [x.image_url] : []),
      price: x.price ?? '',
      discount_price: x.discount_price ?? '',
    });
    setProducts((p.data || []).map(coerce));
    setServices((s.data || []).map(coerce));
  }

  async function uploadOne(file) {
    const form = new FormData();
    form.append('image', file);
    const { data } = await api.post('/api/upload/image', form, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
    return data.image_url; // relative path
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tab === 'products' ? products : services;
    if (!q) return list;
    return list.filter((x) =>
      String(x.name || '').toLowerCase().includes(q) ||
      String(x.bio || '').toLowerCase().includes(q)
    );
  }, [tab, query, products, services]);

  function ItemEditor({ initial, type, onSaved, onDeleted, isDraft }) {
    const [item, setItem] = useState(() => ({ ...initial }));
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef(null);

    function setField(field) {
      return (e) => setItem(prev => ({ ...prev, [field]: e.target.value }));
    }

    async function onPickFiles(files) {
      if (!files || !files.length) return;
      setUploading(true);
      setError('');
      try {
        const urls = [];
        for (const f of Array.from(files)) {
          const u = await uploadOne(f);
          urls.push(u);
        }
        setItem(prev => ({ ...prev, images: [...(prev.images || []), ...urls] }));
      } catch (e) {
        setError(e?.response?.data?.error || e?.message || 'Upload failed');
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    }

    function removeImage(idx) {
      setItem(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
    }

    function moveImage(idx, dir) {
      setItem(prev => {
        const arr = [...(prev.images || [])];
        const j = idx + dir;
        if (j < 0 || j >= arr.length) return prev;
        [arr[idx], arr[j]] = [arr[j], arr[idx]];
        return { ...prev, images: arr };
      });
    }

    async function save() {
      setSaving(true);
      setError('');
      try {
        const payload = normalizeOut(item);
        if (!payload.name || payload.price == null) {
          setError('Name and valid price are required');
          setSaving(false);
          return;
        }
        if (type === 'product') {
          if (payload.id) await api.put(`/api/products/${payload.id}`, payload, { headers });
          else await api.post('/api/products', payload, { headers });
        } else {
          if (payload.id) await api.put(`/api/services/${payload.id}`, payload, { headers });
          else await api.post('/api/services', payload, { headers });
        }
        await onSaved();
      } catch (e) {
        setError(e?.response?.data?.error || e?.message || 'Save failed');
      } finally {
        setSaving(false);
      }
    }

    async function del() {
      if (!item.id) return;
      if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
      setSaving(true);
      setError('');
      try {
        if (type === 'product') await api.delete(`/api/products/${item.id}`, { headers });
        else await api.delete(`/api/services/${item.id}`, { headers });
        await onDeleted();
      } catch (e) {
        setError(e?.response?.data?.error || e?.message || 'Delete failed');
      } finally {
        setSaving(false);
      }
    }

    const isNew = !item.id;
    const priceLabel = money(item.discount_price !== '' && item.discount_price != null ? item.discount_price : item.price);

    return (
      <div className={cx(
        "rounded-2xl border bg-neutral-900/60 p-5 shadow-xl backdrop-blur",
        isDraft ? "border-cyan-500/30 ring-1 ring-cyan-500/10" : "border-white/10"
      )}>
        {!isNew && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-white truncate">{item.name || 'Unnamed item'}</span>
            {priceLabel && <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">{priceLabel}</span>}
            {item.id && <span className="ml-auto text-xs text-neutral-500">ID {item.id}</span>}
          </div>
        )}
        {!isNew && <div className="border-t border-white/10 mb-4" />}

        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Name</label>
              <input className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Product/Service name" value={item.name || ''} onChange={setField('name')} type="text" />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Price</label>
              <input className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                inputMode="decimal" placeholder="e.g. 19.99" value={item.price ?? ''} onChange={setField('price')} type="text" />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Discount price (optional)</label>
              <input className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                inputMode="decimal" placeholder="e.g. 14.99" value={item.discount_price ?? ''} onChange={setField('discount_price')} type="text" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-neutral-400 mb-1">
                Description — <span className="text-neutral-500">Markdown supported</span>
              </label>
              <textarea rows={4} className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Describe the item. Markdown works: **bold**, - lists, # headings…"
                value={item.bio || ''} onChange={setField('bio')} />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Images ({item.images?.length || 0})</label>
              <div className="rounded-lg border border-dashed border-white/15 bg-neutral-800/60 p-3">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => onPickFiles(e.target.files)}
                  className="w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:text-white hover:file:bg-cyan-500"
                />
                {uploading && <p className="mt-2 text-xs text-neutral-300">Uploading…</p>}
              </div>
            </div>

            {Array.isArray(item.images) && item.images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {item.images.map((src, idx) => (
                  <div key={`${src}-${idx}`} className="group relative rounded-lg overflow-hidden border border-white/10">
                    <img src={imgSrc(src)} alt="" className="w-full h-24 object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
                      <button type="button" className="px-2 py-1 rounded bg-neutral-900/80 text-xs" onClick={() => moveImage(idx, -1)} aria-label="Move image earlier">◀</button>
                      <button type="button" className="px-2 py-1 rounded bg-red-600 text-xs" onClick={() => removeImage(idx)} aria-label="Remove image">✕</button>
                      <button type="button" className="px-2 py-1 rounded bg-neutral-900/80 text-xs" onClick={() => moveImage(idx, +1)} aria-label="Move image later">▶</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-4 pt-1">
              {type === 'product' && (
                <>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!item.limited_edition} onChange={e=>setItem(p=>({ ...p, limited_edition: e.target.checked ? 1 : 0 }))} />
                    Limited edition
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={!!item.sold_out} onChange={e=>setItem(p=>({ ...p, sold_out: e.target.checked ? 1 : 0 }))} />
                    Sold out
                  </label>
                </>
              )}
              {type === 'service' && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={(item.active ?? 1) ? true : false} onChange={e=>setItem(p=>({ ...p, active: e.target.checked ? 1 : 0 }))} />
                  Active
                </label>
              )}
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={save} disabled={saving}
            className={cx(
              "inline-flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition",
              saving ? "bg-cyan-900 cursor-wait" : (isNew ? "bg-cyan-600 hover:bg-cyan-500" : "bg-white text-neutral-900 hover:bg-neutral-200")
            )}>
            {saving ? 'Saving…' : (<><Save size={15} /> {isNew ? 'Create' : 'Save changes'}</>)}
          </button>
          {!isNew && (
            <button type="button" onClick={del} disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600/80 hover:bg-red-500 font-semibold transition disabled:opacity-50">
              <Trash2 size={15} /> Delete
            </button>
          )}
          {uploading && <span className="text-xs text-neutral-400">Uploading images…</span>}
        </div>
      </div>
    );
  }

  if (allowed === null) {
    return <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center pt-16">Checking access…</div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6 pt-16">
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

  function handleLogout() { localStorage.removeItem('userToken'); window.location.reload(); }

  const draft = tab === 'products' ? draftP : draftS;
  const kind = tab === 'products' ? 'product' : 'service';
  const list = tab === 'products' ? products : services;
  const empty = !list.length;
  const nothingFound = list.length > 0 && filtered.length === 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_10%,rgba(34,197,94,0.08),transparent_60%)]" />
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-16 relative">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-transparent bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text inline-flex items-center gap-2">
            <ShieldCheck size={26} className="text-emerald-300" /> Admin Panel
          </h1>
          <div className="ml-auto inline-flex rounded-full bg-neutral-900/60 border border-white/10 p-1">
            <button type="button" className={cx("px-3 py-2 rounded-full text-sm transition", tab==='products' ? 'bg-white text-black' : 'text-neutral-300 hover:text-white')} onClick={()=>setTab('products')}>
              Products{products.length ? <span className="ml-1.5 text-xs opacity-70">({products.length})</span> : null}
            </button>
            <button type="button" className={cx("px-3 py-2 rounded-full text-sm transition", tab==='services' ? 'bg-white text-black' : 'text-neutral-300 hover:text-white')} onClick={()=>setTab('services')}>
              Services{services.length ? <span className="ml-1.5 text-xs opacity-70">({services.length})</span> : null}
            </button>
          </div>
          <button type="button" onClick={handleLogout} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-neutral-800 hover:bg-neutral-700 transition text-sm">
            <LogOut size={14} /> Logout
          </button>
        </div>

        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-neutral-200 inline-flex items-center gap-2">
            <Plus size={17} className="text-cyan-400" /> Add {kind}
          </h2>
          <ItemEditor
            key={`draft-${kind}-${draftEpoch}`}
            isDraft
            type={kind}
            initial={draft}
            onSaved={async () => {
              setDraftP(createDraft('product'));
              setDraftS(createDraft('service'));
              setDraftEpoch((n) => n + 1);
              await refresh();
              say('Created — the shop is live 🎉');
            }}
            onDeleted={() => {}}
          />
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="text-lg font-semibold text-neutral-200">
              All {tab} {list.length > 0 && <span className="text-sm font-normal text-neutral-500">({list.length})</span>}
            </h2>
            {list.length > 1 && (
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${tab}…`}
                  className="w-64 rounded-lg border border-white/10 bg-neutral-900 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            )}
          </div>

          {empty && (
            <div className="rounded-2xl border border-dashed border-white/15 bg-neutral-900/40 p-10 text-center text-neutral-400">
              <p className="mb-1 text-white font-medium">No {tab} yet</p>
              <p className="text-sm">Create your first {kind} above — it appears in the shop immediately.</p>
            </div>
          )}
          {nothingFound && (
            <div className="rounded-2xl border border-dashed border-white/15 bg-neutral-900/40 p-8 text-center text-neutral-400 text-sm">
              No {tab} match “{query}”.
            </div>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            {filtered.map((it) => (
              <ItemEditor
                key={it.id}
                type={kind}
                initial={it}
                onSaved={async () => { await refresh(); say('Saved ✓'); }}
                onDeleted={async () => { await refresh(); say('Deleted'); }}
              />
            ))}
          </div>
        </section>

        <footer className="mt-14 text-xs text-neutral-500">Built with love • Keep it private ⚙️</footer>
      </div>

      {/* Toast */}
      <div className={cx(
        "fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] transition-all duration-300",
        toast ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2"
      )}>
        <div className="rounded-full border border-white/10 bg-neutral-900/95 px-5 py-2.5 text-sm text-white shadow-xl backdrop-blur">
          {toast}
        </div>
      </div>
    </div>
  );
}
