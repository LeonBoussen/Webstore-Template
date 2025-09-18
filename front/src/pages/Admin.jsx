// Admin.jsx (logic from your first file + styling/layout from your second file)
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";

const API_BASE = "http://127.0.0.1:5000";
const api = axios.create({ baseURL: API_BASE });

// ---- Variants API (unchanged logic) ----
async function listVariants(productId, headers){
  const { data } = await api.get(`/api/products/${productId}/variants`, { headers });
  return data;
}
async function createVariant(productId, payload, headers){
  const { data } = await api.post(`/api/products/${productId}/variants`, payload, { headers });
  return data;
}
async function updateVariant(variantId, payload, headers){
  await api.put(`/api/variants/${variantId}`, payload, { headers });
}
async function deleteVariant(variantId, headers){
  await api.delete(`/api/variants/${variantId}`, { headers });
}

// ---- Auth / helpers (unchanged logic) ----
function useAuth() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('userToken') : null;
  const headers = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  return { token, headers };
}

function cx(...cls) { return cls.filter(Boolean).join(" "); }

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
    images: Array.isArray(item.images) ? item.images : [],
    limited_edition: item.limited_edition ? 1 : 0,
    sold_out: item.sold_out ? 1 : 0,
    active: item.active ? 1 : 0,
  };
}

function createDraft(type) {
  return type === "product"
    ? { name: "", bio: "", price: "", discount_price: "", images: [], limited_edition: 0, sold_out: 0 }
    : { name: "", bio: "", price: "", discount_price: "", images: [], active: 1 };
}

export default function Admin() {
  const { token, headers } = useAuth();
  const [allowed, setAllowed] = useState(null);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("products");
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [draftP, setDraftP] = useState(createDraft("product"));
  const [draftS, setDraftS] = useState(createDraft("service"));
  const [busy, setBusy] = useState(false); // kept (unused), to preserve parity

  // --- Access check (logic unchanged) ---
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) { alive && setAllowed(false); alive && setMsg("Please log in."); return; }
      try {
        const meRes = await fetch(`${API_BASE}/api/auth/me`, { headers });
        if (!meRes.ok) throw new Error("me failed");
        const me = await meRes.json();
        if (alive) setAllowed(me.username === "LeonBoussen");
        if (alive && me.username !== "LeonBoussen") setMsg("Admin access is restricted.");
      } catch (e) {
        if (!alive) return;
        setAllowed(false);
        setMsg("Session expired. Please log in again.");
      }
    })();
    return () => { alive = false; };
  }, [token]);

  useEffect(() => { if (allowed) refresh(); }, [allowed]);

  // --- Data refresh (logic unchanged) ---
  async function refresh() {
    const [p, s] = await Promise.all([
      api.get("/api/products"),
      api.get("/api/services"),
    ]);
    const coerce = (x) => ({
      ...x,
      images: Array.isArray(x.images) ? x.images : (x.image_url ? [x.image_url] : []),
      price: x.price ?? "",
      discount_price: x.discount_price ?? "",
    });
    setProducts((p.data || []).map(coerce));
    setServices((s.data || []).map(coerce));
  }

  // --- Single image upload (logic unchanged) ---
  async function uploadOne(file) {
    const form = new FormData();
    form.append("image", file);
    const { data } = await api.post("/api/upload/image", form, {
      headers: { ...headers, "Content-Type": "multipart/form-data" },
    });
    return data.image_url; // relative path
  }

  // ---- ItemEditor (logic preserved, styling adapted) ----
  function ItemEditor({ initial, type, onSaved, onDeleted }) {
    const tempIdRef = useRef(Math.random().toString(36).slice(2));
    const [item, setItem] = useState(() => ({ ...initial }));
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [variants, setVariants] = useState([]);

    // Load variants for products (logic unchanged)
    useEffect(() => {
      (async () => {
        if (type === "product" && initial.id) {
          try { setVariants(await listVariants(initial.id, headers)); } catch {}
        } else {
          setVariants([]);
        }
      })();
    }, [initial.id, type]);

    // Sync when switching items
    useEffect(() => { setItem({ ...initial }); setError(""); }, [initial.id]);

    function setField(field) {
      return (e) => setItem((prev) => ({ ...prev, [field]: e.target.value }));
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
        if (!payload.name || payload.price == null) {
          setError("Name and valid price are required");
          setSaving(false);
          return;
        }
        if (type === "product") {
          if (payload.id) await api.put(`/api/products/${payload.id}`, payload, { headers });
          else await api.post("/api/products", payload, { headers });
        } else {
          if (payload.id) await api.put(`/api/services/${payload.id}`, payload, { headers });
          else await api.post("/api/services", payload, { headers });
        }
        await onSaved();
      } catch (e) {
        setError(e?.response?.data?.error || e?.message || "Save failed");
      } finally {
        setSaving(false);
      }
    }

    async function del() {
      if (!item.id) return;
      if (!confirm("Delete this item?")) return;
      setSaving(true);
      try {
        if (type === "product") await api.delete(`/api/products/${item.id}`, { headers });
        else await api.delete(`/api/services/${item.id}`, { headers });
        await onDeleted();
      } catch (e) {
        setError(e?.response?.data?.error || e?.message || "Delete failed");
      } finally {
        setSaving(false);
      }
    }

    // ---- Render (styled like your second file) ----
    return (
      <div className="rounded-2xl bg-neutral-900/60 border border-white/10 p-5 shadow-xl backdrop-blur">
        <div className="grid md:grid-cols-3 gap-4">
          {/* Left form grid */}
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
              <label className="block text-xs text-neutral-400 mb-1">Discount price (optional)</label>
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
              <label className="block text-xs text-neutral-400 mb-1">Description</label>
              <textarea
                rows={3}
                className="w-full p-3 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                placeholder="Short description"
                value={item.bio || ""}
                onChange={setField("bio")}
              />
            </div>
          </div>

          {/* Right column: images + toggles */}
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
                      <button type="button" className="px-2 py-1 rounded bg-neutral-900/80 text-xs" onClick={() => moveImage(idx, -1)}>◀</button>
                      <button type="button" className="px-2 py-1 rounded bg-red-600 text-xs" onClick={() => removeImage(idx)}>Remove</button>
                      <button type="button" className="px-2 py-1 rounded bg-neutral-900/80 text-xs" onClick={() => moveImage(idx, +1)}>▶</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-4 pt-1">
              {type === "product" && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!item.limited_edition}
                      onChange={(e) => setItem((p) => ({ ...p, limited_edition: e.target.checked ? 1 : 0 }))}
                    />
                    Limited edition
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!item.sold_out}
                      onChange={(e) => setItem((p) => ({ ...p, sold_out: e.target.checked ? 1 : 0 }))}
                    />
                    Sold out
                  </label>
                </>
              )}
              {type === "service" && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={(item.active ?? 1) ? true : false}
                    onChange={(e) => setItem((p) => ({ ...p, active: e.target.checked ? 1 : 0 }))}
                  />
                  Active
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
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
            {item.id ? "Save changes" : "Create"}
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

        {/* ---- Product variants panel (logic unchanged, styled to match) ---- */}
        {type === "product" && item.id && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-neutral-200">Variants</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-3 py-1 rounded-full bg-neutral-800 border border-white/10 text-sm hover:bg-neutral-700"
                  onClick={() =>
                    setVariants((v) => [
                      ...v,
                      {
                        name: "",
                        attributes: {},
                        price_delta: 0,
                        active: 1,
                        sort_order:
                          v.length > 0
                            ? Math.max(...v.map((x) => (typeof x.sort_order === "number" ? x.sort_order : 0))) + 1
                            : 0,
                        images: [],
                      },
                    ])
                  }
                >
                  + Add variant
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded-full bg-neutral-800 border border-white/10 text-sm hover:bg-neutral-700"
                  onClick={() =>
                    setVariants((a) =>
                      a.map((x) =>
                        x.attributes && x.attributes.Color != null
                          ? x
                          : { ...x, attributes: { ...(x.attributes || {}), Color: "" } }
                      )
                    )
                  }
                >
                  + Add “Color” attribute to all
                </button>
              </div>
            </div>

            {variants.length === 0 ? (
              <p className="text-sm text-neutral-400">No variants yet.</p>
            ) : (
              <div className="space-y-4">
                {variants.map((v, idx) => (
                  <div key={(v.id ?? "tmp") + "-" + idx} className="rounded-xl border border-white/10 p-3 bg-neutral-900/40">
                    {/* Row: label / price / active / sort */}
                    <div className="grid md:grid-cols-4 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs text-neutral-400 mb-1">Label (optional)</label>
                        <input
                          className="w-full p-2 rounded bg-neutral-800 border border-white/10"
                          value={v.name || ""}
                          placeholder="e.g. Black 256 GB"
                          onChange={(e) =>
                            setVariants((a) => a.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                          }
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-neutral-400 mb-1">Price delta</label>
                        <input
                          type="number"
                          inputMode="decimal"
                          className="w-full p-2 rounded bg-neutral-800 border border-white/10"
                          value={v.price_delta ?? 0}
                          onChange={(e) =>
                            setVariants((a) =>
                              a.map((x, i) =>
                                i === idx ? { ...x, price_delta: Number(e.target.value || 0) } : x
                              )
                            )
                          }
                        />
                      </div>

                      <div className="flex items-end gap-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!v.active}
                            onChange={(e) =>
                              setVariants((a) =>
                                a.map((x, i) => (i === idx ? { ...x, active: e.target.checked ? 1 : 0 } : x))
                              )
                            }
                          />
                          Active
                        </label>
                        <div className="flex-1">
                          <label className="block text-xs text-neutral-400 mb-1">Sort</label>
                          <input
                            type="number"
                            className="w-full p-2 rounded bg-neutral-800 border border-white/10"
                            value={v.sort_order ?? 0}
                            onChange={(e) =>
                              setVariants((a) =>
                                a.map((x, i) => (i === idx ? { ...x, sort_order: Number(e.target.value || 0) } : x))
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>

                    {/* Attributes */}
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-400">Attributes</span>
                        <button
                          type="button"
                          className="px-2 py-1 rounded bg-neutral-800 border border-white/10 text-xs hover:bg-neutral-700"
                          onClick={() =>
                            setVariants((a) =>
                              a.map((x, i) =>
                                i !== idx
                                  ? x
                                  : {
                                      ...x,
                                      attributes: { ...(x.attributes || {}), "": "" },
                                    }
                              )
                            )
                          }
                        >
                          + Add attribute
                        </button>
                      </div>

                      {Object.entries(v.attributes || {}).map(([k, val], ai) => (
                        <div key={k + "-" + ai} className="grid grid-cols-2 gap-2">
                          <input
                            className="p-2 rounded bg-neutral-800 border border-white/10"
                            placeholder="Key (e.g. Color)"
                            value={k}
                            onChange={(e) => {
                              const nk = e.target.value;
                              setVariants((a) =>
                                a.map((x, i) => {
                                  if (i !== idx) return x;
                                  const obj = { ...(x.attributes || {}) };
                                  delete obj[k];
                                  obj[nk] = val;
                                  return { ...x, attributes: obj };
                                })
                              );
                            }}
                          />
                          <div className="flex gap-2">
                            <input
                              className="flex-1 p-2 rounded bg-neutral-800 border border-white/10"
                              placeholder="Value"
                              value={String(val ?? "")}
                              onChange={(e) =>
                                setVariants((a) =>
                                  a.map((x, i) =>
                                    i !== idx
                                      ? x
                                      : {
                                          ...x,
                                          attributes: { ...(x.attributes || {}), [k]: e.target.value },
                                        }
                                  )
                                )
                              }
                            />
                            <button
                              type="button"
                              className="px-2 rounded bg-red-600 text-xs hover:bg-red-500"
                              onClick={() =>
                                setVariants((a) =>
                                  a.map((x, i) => {
                                    if (i !== idx) return x;
                                    const obj = { ...(x.attributes || {}) };
                                    delete obj[k];
                                    return { ...x, attributes: obj };
                                  })
                                )
                              }
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Variant images */}
                    <div className="mt-3">
                      <label className="block text-xs text-neutral-400 mb-1">Variant images</label>
                      <input
                        type="file"
                        multiple
                        accept="image/*"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          if (!files.length) return;
                          const urls = [];
                          for (const f of files) {
                            const u = await uploadOne(f);
                            urls.push(u);
                          }
                          setVariants((a) =>
                            a.map((x, i) => (i === idx ? { ...x, images: [...(x.images || []), ...urls] } : x))
                          );
                        }}
                        className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-neutral-800 file:text-neutral-200 hover:file:bg-neutral-700"
                      />

                      {Array.isArray(v.images) && v.images.length > 0 && (
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          {v.images.map((src, ii) => (
                            <div key={src + "-" + ii} className="group relative rounded-lg overflow-hidden border border-white/10">
                              <img src={`${API_BASE}${src}`} alt="" className="w-full h-20 object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded bg-neutral-900/80 text-xs border border-white/10"
                                  onClick={() =>
                                    setVariants((a) =>
                                      a.map((x, i) => {
                                        if (i !== idx) return x;
                                        const imgs = [...(x.images || [])];
                                        if (ii > 0) [imgs[ii - 1], imgs[ii]] = [imgs[ii], imgs[ii - 1]];
                                        return { ...x, images: imgs };
                                      })
                                    )
                                  }
                                >
                                  ◀
                                </button>
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded bg-red-600 text-xs"
                                  onClick={() =>
                                    setVariants((a) =>
                                      a.map((x, i) => {
                                        if (i !== idx) return x;
                                        const imgs = [...(x.images || [])].filter((_, j) => j !== ii);
                                        return { ...x, images: imgs };
                                      })
                                    )
                                  }
                                >
                                  Remove
                                </button>
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded bg-neutral-900/80 text-xs border border-white/10"
                                  onClick={() =>
                                    setVariants((a) =>
                                      a.map((x, i) => {
                                        if (i !== idx) return x;
                                        const imgs = [...(x.images || [])];
                                        if (ii < imgs.length - 1) [imgs[ii + 1], imgs[ii]] = [imgs[ii], imgs[ii + 1]];
                                        return { ...x, images: imgs };
                                      })
                                    )
                                  }
                                >
                                  ▶
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Variant Save/Delete */}
                    <div className="mt-3 flex gap-2">
                      {!v.id ? (
                        <button
                          type="button"
                          className="px-3 py-1 rounded-full bg-cyan-600 hover:bg-cyan-500"
                          onClick={async () => {
                            const payload = {
                              name: v.name,
                              attributes: v.attributes || {},
                              price_delta: v.price_delta ?? 0,
                              active: !!v.active,
                              sort_order: v.sort_order ?? 0,
                              images: v.images || [],
                            };
                            await createVariant(item.id, payload, headers);
                            setVariants(await listVariants(item.id, headers));
                          }}
                        >
                          Create
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="px-3 py-1 rounded-full bg-cyan-600 hover:bg-cyan-500"
                            onClick={async () => {
                              const payload = {
                                name: v.name,
                                attributes: v.attributes || {},
                                price_delta: v.price_delta ?? 0,
                                active: !!v.active,
                                sort_order: v.sort_order ?? 0,
                                images: v.images || [],
                              };
                              await updateVariant(v.id, payload, headers);
                              setVariants(await listVariants(item.id, headers));
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="px-3 py-1 rounded-full bg-red-600 hover:bg-red-500"
                            onClick={async () => {
                              if (!confirm("Delete this variant?")) return;
                              await deleteVariant(v.id, headers);
                              setVariants(await listVariants(item.id, headers));
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  } // end ItemEditor

  // ---- Access screens (styling from your second file) ----
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

  function handleLogout(){ localStorage.removeItem("userToken"); window.location.reload(); }

  // ---- Main layout + tabs (from your second file) ----
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
              className={cx("px-3 py-2 rounded-full text-sm", tab === "products" ? "bg-white text-black" : "text-neutral-300 hover:text-white")}
              onClick={() => setTab("products")}
            >
              Products
            </button>
            <button
              type="button"
              className={cx("px-3 py-2 rounded-full text-sm", tab === "services" ? "bg-white text-black" : "text-neutral-300 hover:text-white")}
              onClick={() => setTab("services")}
            >
              Services
            </button>
          </div>
          <button type="button" onClick={handleLogout} className="px-3 py-2 rounded-full bg-neutral-800 hover:bg-neutral-700">
            Logout
          </button>
        </div>

        {tab === "products" && (
          <section>
            <h2 className="text-lg font-semibold mb-3 text-neutral-200">Add Product</h2>
            <ItemEditor
              key="draft-product"
              type="product"
              initial={draftP}
              onSaved={async () => { setDraftP(createDraft("product")); await refresh(); }}
              onDeleted={async () => { await refresh(); }}
            />

            <h2 className="text-lg font-semibold mt-10 mb-3 text-neutral-200">All Products</h2>
            {products.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-6 text-neutral-400">No products yet.</div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                {products.map((p) => (
                  <ItemEditor
                    key={p.id ?? p.tempId}
                    type="product"
                    initial={p}
                    onSaved={refresh}
                    onDeleted={refresh}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "services" && (
          <section>
            <h2 className="text-lg font-semibold mb-3 text-neutral-200">Add Service</h2>
            <ItemEditor
              key="draft-service"
              type="service"
              initial={draftS}
              onSaved={async () => { setDraftS(createDraft("service")); await refresh(); }}
              onDeleted={async () => { await refresh(); }}
            />

            <h2 className="text-lg font-semibold mt-10 mb-3 text-neutral-200">All Services</h2>
            {services.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-6 text-neutral-400">No services yet.</div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                {services.map((s) => (
                  <ItemEditor
                    key={s.id ?? s.tempId}
                    type="service"
                    initial={s}
                    onSaved={refresh}
                    onDeleted={refresh}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="mt-14 text-xs text-neutral-500">Built with love • Keep it private ⚙️</footer>
      </div>
    </div>
  );
}
