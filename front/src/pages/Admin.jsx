import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const API_BASE = "http://127.0.0.1:5000";
const api = axios.create({ baseURL: API_BASE });

function useAuth() {
  const token = typeof window !== "undefined" ? localStorage.getItem("userToken") : null;
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  return { token, headers };
}

function cx(...cls) {
  return cls.filter(Boolean).join(" ");
}

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeOut(item) {
  return {
    ...item,
    price: toNumberOrNull(item.price),
    discount_price: toNumberOrNull(item.discount_price),
    value: toNumberOrNull(item.value),
    max_uses: toNumberOrNull(item.max_uses),
    images: Array.isArray(item.images) ? item.images : [],
    limited_edition: item.limited_edition ? 1 : 0,
    sold_out: item.sold_out ? 1 : 0,
    active: item.active ? 1 : 0,
  };
}

function createDraft(type) {
  if (type === "product") {
    return { name: "", bio: "", price: "", discount_price: "", images: [], limited_edition: 0, sold_out: 0 };
  } else if (type === "discount") {
    return {
      code: "",
      kind: "percent",
      value: "",
      max_uses: "",
      used_count: 0,
      starts_at: "",
      expires_at: "",
      active: 1,
      applies_to: { mode: "all", product_ids: [], service_ids: [] }
    };
  } else {
    return { name: "", bio: "", price: "", discount_price: "", images: [], active: 1 };
  }
}

export default function Admin() {
  const { token, headers } = useAuth();
  const [allowed, setAllowed] = useState(null);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("products");
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [draftP, setDraftP] = useState(createDraft("product"));
  const [draftS, setDraftS] = useState(createDraft("service"));
  const [draftDiscount, setDraftDiscount] = useState(createDraft("discount"));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) {
        alive && setAllowed(false);
        alive && setMsg("Please log in.");
        return;
      }
      try {
        const meRes = await fetch(`${API_BASE}/api/auth/me`, { headers });
        if (!meRes.ok) throw new Error("me failed");
        const me = await meRes.json();
        if (alive) setAllowed(me.is_admin == 1);
        if (alive && !me.is_admin) setMsg("Admin access is restricted.");
      } catch (e) {
        if (!alive) return;
        setAllowed(false);
        setMsg("Session expired. Please log in again.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (allowed) refresh();
    // eslint-disable-next-line
  }, [allowed]);

  async function refresh() {
    const [p, s] = await Promise.all([api.get("/api/products"), api.get("/api/services")]);
    const productsDetails = await Promise.all(
      (p.data || []).map((prod) => api.get(`/api/products/${prod.id}`).then((res) => res.data))
    );
    setProducts(productsDetails);

    const coerce = (x) => ({
      ...x,
      images: Array.isArray(x.images) ? x.images : x.image_url ? [x.image_url] : [],
      price: x.price ?? "",
      discount_price: x.discount_price ?? "",
    });
    setServices((s.data || []).map(coerce));

    const d = await api.get("/api/discount");
    setDiscounts(d.data || []);
  }

  async function uploadOne(file) {
    const form = new FormData();
    form.append("image", file);
    const { data } = await api.post("/api/upload/image", form, { headers });
    return data.image_url;
  }

  function ItemEditor({ initial, type, onSaved, onDeleted }) {
    const tempIdRef = useRef(Math.random().toString(36).slice(2));
    const [item, setItem] = useState(() => ({ ...initial }));
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
      setItem({ ...initial });
      setError("");
    }, [initial.id, initial.code]);

    function setField(field) {
      return (e) => setItem((prev) => ({ ...prev, [field]: e.target.value }));
    }

    function toggleProductInList(productId) {
      setItem(prev => {
        const applies = prev.applies_to || { mode: "all", product_ids: [], service_ids: [] };
        const ids = applies.product_ids || [];
        const newIds = ids.includes(productId) 
          ? ids.filter(id => id !== productId)
          : [...ids, productId];
        return {
          ...prev,
          applies_to: { ...applies, product_ids: newIds }
        };
      });
    }

    function toggleServiceInList(serviceId) {
      setItem(prev => {
        const applies = prev.applies_to || { mode: "all", product_ids: [], service_ids: [] };
        const ids = applies.service_ids || [];
        const newIds = ids.includes(serviceId) 
          ? ids.filter(id => id !== serviceId)
          : [...ids, serviceId];
        return {
          ...prev,
          applies_to: { ...applies, service_ids: newIds }
        };
      });
    }

    async function onPickFiles(files) {
      if (!files || !files.length) return;
      setUploading(true);
      try {
        const urls = [];
        for (const f of Array.from(files)) {
          const u = await uploadOne(f);
          urls.push(u);
        }
        setItem((prev) => ({ ...prev, images: [...(prev.images || []), ...urls] }));
      } catch (e) {
        setError(e?.response?.data?.error || e?.message || "Upload failed");
      } finally {
        setUploading(false);
      }
    }

    function removeImage(idx) {
      setItem((prev) => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
    }

    function moveImage(idx, dir) {
      setItem((prev) => {
        const arr = [...(prev.images || [])];
        const j = idx + dir;
        if (j < 0 || j >= arr.length) return prev;
        [arr[idx], arr[j]] = [arr[j], arr[idx]];
        return { ...prev, images: arr };
      });
    }

    async function save() {
      setSaving(true);
      setError("");
      try {
        const payload = normalizeOut(item);
        if (type === "product" && (!payload.name || payload.price == null)) {
          setError("Name and valid price are required");
          setSaving(false);
          return;
        }
        if (type === "discount") {
          if (!payload.code || payload.value == null) {
            setError("Discount code and value are required");
            setSaving(false);
            return;
          }
        }
        if (type === "product") {
          if (payload.id) {
            await api.put(`/api/products/${payload.id}`, payload, { headers });
          } else {
            await api.post("/api/products", payload, { headers });
          }
        } else if (type === "discount") {
          if (initial.code && initial.code === payload.code) {
            await api.put(`/api/discount/${payload.code}`, payload, { headers });
          } else {
            await api.post("/api/discount", payload, { headers });
          }
        } else if (type === "service") {
          if (payload.id) {
            await api.put(`/api/services/${payload.id}`, payload, { headers });
          } else {
            await api.post("/api/services", payload, { headers });
          }
        }
        await onSaved();
      } catch (e) {
        setError(e?.response?.data?.error || e?.message || "Save failed");
      } finally {
        setSaving(false);
      }
    }

    async function del() {
      if (type === "discount" && !item.code) return;
      if (type !== "discount" && !item.id) return;
      if (!window.confirm("Delete this item?")) return;
      setSaving(true);
      try {
        if (type === "product") await api.delete(`/api/products/${item.id}`, { headers });
        else if (type === "discount") {
          await api.delete(`/api/discount/${item.code}`, { headers });
          await onDeleted();
          setSaving(false);
          return;
        } else await api.delete(`/api/services/${item.id}`, { headers });
        await onDeleted();
      } catch (e) {
        setError(e?.response?.data?.error || e?.message || "Delete failed");
      } finally {
        setSaving(false);
      }
    }

    // Discount-specific UI
    if (type === "discount") {
      const applies = item.applies_to || { mode: "all", product_ids: [], service_ids: [] };
      
      return (
        <div className="rounded-2xl bg-neutral-900/60 border border-white/10 p-5 shadow-xl backdrop-blur">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Discount Code</label>
              <input
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="e.g. SAVE20"
                value={item.code || ""}
                onChange={setField("code")}
                type="text"
                disabled={!!initial.code}
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Discount Type</label>
              <select
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                value={item.kind || "percent"}
                onChange={setField("kind")}
              >
                <option value="percent">Percentage (%)</option>
                <option value="fixed">Fixed Amount (€)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                {item.kind === "fixed" ? "Discount Amount (€)" : "Discount Percentage (%)"}
              </label>
              <input
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                inputMode="decimal"
                placeholder={item.kind === "fixed" ? "e.g. 10.00" : "e.g. 20"}
                value={item.value ?? ""}
                onChange={setField("value")}
                type="text"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Max Uses (optional)</label>
              <input
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                inputMode="numeric"
                placeholder="e.g. 100"
                value={item.max_uses ?? ""}
                onChange={setField("max_uses")}
                type="text"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Used Count</label>
              <input
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10"
                value={item.used_count || 0}
                readOnly
                type="text"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Starts At (optional)</label>
              <input
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                value={item.starts_at || ""}
                onChange={setField("starts_at")}
                type="datetime-local"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Expires At (optional)</label>
              <input
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                value={item.expires_at || ""}
                onChange={setField("expires_at")}
                type="datetime-local"
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center gap-2 text-sm mb-3">
                <input 
                  type="checkbox" 
                  checked={!!item.active} 
                  onChange={e => setItem(p => ({ ...p, active: e.target.checked ? 1 : 0 }))} 
                />
                Active
              </label>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-neutral-400 mb-2">Applies To</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`applies-${tempIdRef.current}`}
                    checked={applies.mode === "all"}
                    onChange={() => setItem(p => ({ ...p, applies_to: { ...applies, mode: "all" } }))}
                  />
                  All Products & Services
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`applies-${tempIdRef.current}`}
                    checked={applies.mode === "whitelist"}
                    onChange={() => setItem(p => ({ ...p, applies_to: { ...applies, mode: "whitelist" } }))}
                  />
                  Whitelist (Only selected items)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`applies-${tempIdRef.current}`}
                    checked={applies.mode === "blacklist"}
                    onChange={() => setItem(p => ({ ...p, applies_to: { ...applies, mode: "blacklist" } }))}
                  />
                  Blacklist (Exclude selected items)
                </label>
              </div>
            </div>

            {applies.mode !== "all" && (
              <div className="md:col-span-2 space-y-3">
                <div className="rounded-lg border border-white/10 bg-neutral-800/60 p-4">
                  <h4 className="text-sm font-medium mb-2">Select Products</h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {products.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={applies.product_ids?.includes(p.id) || false}
                          onChange={() => toggleProductInList(p.id)}
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
                
                <div className="rounded-lg border border-white/10 bg-neutral-800/60 p-4">
                  <h4 className="text-sm font-medium mb-2">Select Services</h4>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {services.map(s => (
                      <label key={s.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={applies.service_ids?.includes(s.id) || false}
                          onChange={() => toggleServiceInList(s.id)}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={cx(
                "px-4 py-2 rounded-full font-semibold transition",
                saving ? "bg-cyan-900" : "bg-cyan-600 hover:bg-cyan-500"
              )}
            >
              Save
            </button>
            {item.code && (
              <button
                type="button"
                onClick={del}
                className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-500"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      );
    }

    // Product/Service UI (unchanged from original)
    return (
      <div className="rounded-2xl bg-neutral-900/60 border border-white/10 p-5 shadow-xl backdrop-blur">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Name</label>
              <input
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Product/Service name"
                value={item.name || ""}
                onChange={setField("name")}
                type="text"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-400 mb-1">Price</label>
              <input
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                inputMode="decimal"
                placeholder="e.g. 19.99"
                value={item.price ?? ""}
                onChange={setField("price")}
                type="text"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                Discount price (optional)
              </label>
              <input
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                inputMode="decimal"
                placeholder="e.g. 14.99"
                value={item.discount_price ?? ""}
                onChange={setField("discount_price")}
                type="text"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-neutral-400 mb-1">
                Description
              </label>
              <textarea
                rows={3}
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Short description"
                value={item.bio || ""}
                onChange={setField("bio")}
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-xs text-neutral-400 mb-1">Images</label>
            <div className="rounded-lg border border-dashed border-white/15 bg-neutral-800/60 p-3">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onPickFiles(e.target.files)}
                className="w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-cyan-600 file:px-4 file:py-2 file:text-white hover:file:bg-cyan-500"
              />
              {uploading && <p className="mt-2 text-xs text-neutral-300">Uploading…</p>}
            </div>
            {Array.isArray(item.images) && item.images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {item.images.map((src, idx) => (
                  <div key={src + idx} className="group relative rounded-lg overflow-hidden border border-white/10">
                    <img src={`${API_BASE}${src}`} alt="" className="w-full h-24 object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <button type="button" className="px-2 py-1 rounded bg-neutral-900/80 text-xs" onClick={() => moveImage(idx, -1)}>
                        ◀
                      </button>
                      <button type="button" className="px-2 py-1 rounded bg-red-600 text-xs" onClick={() => removeImage(idx)}>
                        Remove
                      </button>
                      <button type="button" className="px-2 py-1 rounded bg-neutral-900/80 text-xs" onClick={() => moveImage(idx, +1)}>
                        ▶
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-4 pt-1">
              {type === "product" && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!item.limited_edition} onChange={e => setItem(p => ({ ...p, limited_edition: e.target.checked ? 1 : 0 }))} />
                    Limited edition
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!item.sold_out} onChange={e => setItem(p => ({ ...p, sold_out: e.target.checked ? 1 : 0 }))} />
                    Sold out
                  </label>
                </>
              )}
              {type === "service" && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={item.active ?? 1 ? true : false} onChange={e => setItem(p => ({ ...p, active: e.target.checked ? 1 : 0 }))} />
                  Active
                </label>
              )}
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={cx(
              "px-4 py-2 rounded-full font-semibold transition",
              saving ? "bg-cyan-900" : "bg-cyan-600 hover:bg-cyan-500"
            )}
          >
            Save
          </button>
          {item.id && (
            <button
              type="button"
              onClick={del}
              className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-500"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  if (allowed === null) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center pt-16">
        Checking access…
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6 pt-16">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold mb-2">Access denied</h1>
          <p className="text-neutral-300">{msg}</p>
          <div className="mt-4">
            <Link className="underline underline-offset-4 decoration-cyan-400" to="/login">
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  function handleLogout() {
    localStorage.removeItem("userToken");
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_10%,rgba(34,197,94,0.08),transparent_60%)]" />
      <div className="max-w-7xl mx-auto px-6 pt-24 pb-16 relative">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-transparent bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text">
            Admin Panel
          </h1>
          <div className="ml-auto inline-flex rounded-full bg-neutral-900/60 border border-white/10 p-1">
            <button
              type="button"
              className={cx(
                "px-3 py-2 rounded-full text-sm",
                tab === "products" ? "bg-white text-black" : "text-neutral-300 hover:text-white"
              )}
              onClick={() => setTab("products")}
            >
              Products
            </button>
            <button
              type="button"
              className={cx(
                "px-3 py-2 rounded-full text-sm",
                tab === "services" ? "bg-white text-black" : "text-neutral-300 hover:text-white"
              )}
              onClick={() => setTab("services")}
            >
              Services
            </button>
            <button
              type="button"
              className={cx(
                "px-3 py-2 rounded-full text-sm",
                tab === "discounts" ? "bg-white text-black" : "text-neutral-300 hover:text-white"
              )}
              onClick={() => setTab("discounts")}
            >
              Discounts
            </button>
            <button
              type="button"
              className={cx(
                "px-3 py-2 rounded-full text-sm",
                tab === "users" ? "bg-white text-black" : "text-neutral-300 hover:text-white"
              )}
              onClick={() => setTab("users")}
            >
              Users
            </button>
            <button
              type="button"
              className={cx(
                "px-3 py-2 rounded-full text-sm",
                tab === "orders" ? "bg-white text-black" : "text-neutral-300 hover:text-white"
              )}
              onClick={() => setTab("orders")}
            >
              Orders
            </button>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-2 rounded-full bg-neutral-800 hover:bg-neutral-700"
          >
            Logout
          </button>
        </div>

        {tab === "products" && (
          <section>
            <h2 className="text-lg font-semibold mb-3 text-neutral-200">
              Add Product
            </h2>
            <ItemEditor
              key="draft-product"
              type="product"
              initial={draftP}
              onSaved={async () => {
                setDraftP(createDraft("product"));
                await refresh();
              }}
              onDeleted={async () => {
                await refresh();
              }}
            />

            <h2 className="text-lg font-semibold mt-10 mb-3 text-neutral-200">
              All Products
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              {products.map((p) => (
                <ItemEditor key={p.id} type="product" initial={p} onSaved={refresh} onDeleted={refresh} />
              ))}
            </div>
          </section>
        )}

        {tab === "services" && (
          <section>
            <h2 className="text-lg font-semibold mb-3 text-neutral-200">
              Add Service
            </h2>
            <ItemEditor
              key="draft-service"
              type="service"
              initial={draftS}
              onSaved={async () => {
                setDraftS(createDraft("service"));
                await refresh();
              }}
              onDeleted={async () => {
                await refresh();
              }}
            />

            <h2 className="text-lg font-semibold mt-10 mb-3 text-neutral-200">
              All Services
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              {services.map((s) => (
                <ItemEditor key={s.id} type="service" initial={s} onSaved={refresh} onDeleted={refresh} />
              ))}
            </div>
          </section>
        )}

        {tab === "discounts" && (
          <section>
            <h2 className="text-lg font-semibold mb-3 text-neutral-200">
              Add Discount Code
            </h2>
            <ItemEditor
              key="draft-discount"
              type="discount"
              initial={draftDiscount}
              onSaved={async () => {
                setDraftDiscount(createDraft("discount"));
                await refresh();
              }}
              onDeleted={async () => {
                await refresh();
              }}
            />

            <h2 className="text-lg font-semibold mt-10 mb-3 text-neutral-200">
              Manage Discount Codes
            </h2>
            <div className="grid gap-5 md:grid-cols-2">
              {discounts.map((d) => (
                <ItemEditor
                  key={d.code}
                  type="discount"
                  initial={d}
                  onSaved={refresh}
                  onDeleted={refresh}
                />
              ))}
            </div>
          </section>
        )}

        {tab === "users" && (
          <section>
            <h2 className="text-lg font-semibold mb-3 text-neutral-200">
              Manage Users
            </h2>
          </section>
        )}

        {tab === "orders" && (
          <section>
            <h2 className="text-lg font-semibold mb-3 text-neutral-200">
              Manage Orders
            </h2>
          </section>
        )}

        <footer className="mt-14 text-xs text-neutral-500">Built with love • Keep it private ⚙️</footer>
      </div>
    </div>
  );
}
