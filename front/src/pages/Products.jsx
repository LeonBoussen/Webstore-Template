import React, { useEffect, useMemo, useState } from "react";
import { Plus, Minus, Trash2, ShoppingCart, X } from "lucide-react";

const API_BASE = "http://127.0.0.1:5000";
const fmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const cls = (...x) => x.filter(Boolean).join(" ");
const percentOff = (price, discount) =>
  discount && discount < price ? Math.round(100 - (discount / price) * 100) : 0;
const isUrl = (s) => typeof s === "string" && /^https?:\/\//i.test(s);
const withBase = (u) => (!u ? null : isUrl(u) ? u : `${API_BASE}${u.startsWith("/") ? "" : "/"}${u}`);
const resolveImage = (item) => withBase(item?.image_url) || (isUrl(item?.bio) ? item.bio : null);

function useLocalCart() {
  const read = () => {
    try { return JSON.parse(localStorage.getItem("cart") || "[]"); } catch { return []; }
  };
  const [items, setItems] = useState(read);

  const save = (arr) => {
    localStorage.setItem("cart", JSON.stringify(arr));
    setItems(arr);
    const total = arr.reduce((n, it) => n + (it.qty || 1), 0);
    window.dispatchEvent(new CustomEvent("cart:updated", { detail: { total } }));
  };

  const add = (item) => {
    const arr = [...items];
    const i = arr.findIndex((c) => c.id === item.id && c.kind === item.kind);
    if (i >= 0) arr[i] = { ...arr[i], qty: (arr[i].qty || 1) + 1 };
    else arr.push({ id: item.id, kind: item.kind, name: item.name, price: item.price, discount_price: item.discount_price, image_url: item.image_url, qty: 1 });
    save(arr);
  };

  const inc = (id, kind) => {
    save(items.map(it => (it.id === id && it.kind === kind ? { ...it, qty: it.qty + 1 } : it)));
  };
  const dec = (id, kind) => {
    save(items.flatMap(it => {
      if (it.id !== id || it.kind !== kind) return [it];
      const q = (it.qty || 1) - 1;
      return q > 0 ? [{ ...it, qty: q }] : [];
    }));
  };
  const remove = (id, kind) => save(items.filter(it => !(it.id === id && it.kind === kind)));
  const clear = () => save([]);

  const count = items.reduce((n, it) => n + (it.qty || 1), 0);
  const total = items.reduce((sum, it) => sum + ((it.discount_price ?? it.price) || 0) * (it.qty || 1), 0);

  return { items, add, inc, dec, remove, clear, count, total };
}

// --- UI bits ---
const Ribbon = ({ children, tone = "indigo" }) => (
  <span
    className={cls(
      "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold",
      tone === "indigo" && "bg-indigo-500/10 text-indigo-300",
      tone === "rose"   && "bg-rose-500/10 text-rose-300",
      tone === "amber"  && "bg-amber-500/10 text-amber-300",
      tone === "emerald"&& "bg-emerald-500/10 text-emerald-300"
    )}
  >
    {children}
  </span>
);

const ImageBox = ({ src, alt }) => (
  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-neutral-800">
    {src ? (
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        loading="lazy"
        decoding="async"
      />
    ) : (
      <div className="flex h-full w-full items-center justify-center text-neutral-400">
        No image
      </div>
    )}
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/10" />
  </div>
);

const Price = ({ price, discount }) => {
  const off = percentOff(price, discount);
  if (discount && discount < price) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-emerald-400">{fmt.format(discount)}</span>
        <span className="text-sm line-through text-neutral-400">{fmt.format(price)}</span>
        {off > 0 && (
          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
            −{off}%
          </span>
        )}
      </div>
    );
  }
  return <span className="text-lg font-semibold text-white">{fmt.format(price)}</span>;
};

const Card = ({ item, kind, onAdd }) => {
  const { name, bio, price, discount_price, limited_edition, sold_out } = item;
  const img = resolveImage(item);
  const badges = [
    limited_edition ? { text: "Limited", tone: "amber" } : null,
    sold_out ? { text: "Sold out", tone: "rose" } : null,
  ].filter(Boolean);

  return (
    <div className="group relative flex flex-col rounded-xl border border-white/5 bg-neutral-900/60 p-3 shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] ring-1 ring-black/40 backdrop-blur transition hover:border-white/10 hover:bg-neutral-900">
      <ImageBox src={img} alt={name} />
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-tight text-white">{name}</h3>
          <div className="flex shrink-0 gap-1">
            {badges.map((b, i) => (
              <Ribbon key={i} tone={b.tone}>{b.text}</Ribbon>
            ))}
          </div>
        </div>
        {bio && <p className="text-sm text-neutral-300 max-h-12 overflow-hidden">{bio}</p>}
        <div className="mt-2 flex items-center justify-between gap-3">
          <Price price={price} discount={discount_price} />
          <button
            onClick={() => onAdd({ ...item, kind })}
            disabled={!!sold_out}
            className={cls(
              "rounded-lg px-3 py-2 text-sm font-semibold transition",
              sold_out ? "cursor-not-allowed bg-neutral-800 text-neutral-500"
                       : "bg-white text-neutral-900 hover:bg-neutral-200"
            )}
          >
            {sold_out ? "Unavailable" : "Add to cart"}
          </button>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/5" />
    </div>
  );
};

const CartDrawer = ({ open, onClose, items, inc, dec, remove, total }) => (
  <>
    <div className={cls(
      "fixed inset-0 z-50 bg-black/50 transition-opacity",
      open ? "opacity-100" : "pointer-events-none opacity-0"
    )} onClick={onClose}/>
    <aside className={cls(
      "fixed right-0 top-0 z-50 h-full w-full max-w-md bg-neutral-950 text-white shadow-2xl transition-transform",
      open ? "translate-x-0" : "translate-x-full"
    )} aria-label="Cart drawer">
      <div className="flex items-center justify-between px-4 h-16 border-b border-white/10">
        <h2 className="text-lg font-semibold inline-flex items-center gap-2"><ShoppingCart size={18}/> Cart</h2>
        <button className="rounded-full p-2 bg-neutral-800 hover:bg-neutral-700" onClick={onClose}><X size={18}/></button>
      </div>
      <div className="p-4 space-y-3 overflow-auto h-[calc(100%-8rem)]">
        {items.length === 0 ? (
          <p className="text-neutral-400">Your cart is empty.</p>
        ) : items.map((it) => {
          const priceEach = (it.discount_price ?? it.price) || 0;
          const img = withBase(it.image_url);
          return (
            <div key={`${it.kind}-${it.id}`} className="flex gap-3 rounded-lg border border-white/10 p-3 bg-neutral-900/60">
              <div className="h-16 w-20 overflow-hidden rounded bg-neutral-800">
                {img ? <img src={img} alt="" className="h-full w-full object-cover"/> : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate">
                    <div className="text-sm font-semibold truncate">{it.name}</div>
                    <div className="text-xs text-neutral-400">{it.kind}</div>
                  </div>
                  <button className="text-rose-300 hover:text-rose-200" onClick={()=>remove(it.id, it.kind)} title="Remove">
                    <Trash2 size={16}/>
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="inline-flex items-center gap-2">
                    <button className="h-8 w-8 rounded bg-neutral-800 hover:bg-neutral-700 inline-grid place-items-center" onClick={()=>dec(it.id, it.kind)}><Minus size={16}/></button>
                    <span className="w-6 text-center">{it.qty}</span>
                    <button className="h-8 w-8 rounded bg-neutral-800 hover:bg-neutral-700 inline-grid place-items-center" onClick={()=>inc(it.id, it.kind)}><Plus size={16}/></button>
                  </div>
                  <div className="text-sm font-semibold">{fmt.format(priceEach * (it.qty || 1))}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center justify-between">
          <span className="text-neutral-300">Total</span>
          <span className="text-lg font-semibold">{fmt.format(total)}</span>
        </div>
        <button className="mt-3 w-full rounded-lg bg-white text-neutral-900 font-semibold py-2 hover:bg-neutral-200">Go to checkout</button>
      </div>
    </aside>
  </>
);

export default function Products() {
  const { items, add, inc, dec, remove, clear, count, total } = useLocalCart();
  const [drawer, setDrawer] = useState(false);
  const [firstAdd, setFirstAdd] = useState(false);

  const [tab, setTab] = useState("products");
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("relevance");
  const [hideSold, setHideSold] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    Promise.all([
      fetch(`${API_BASE}/api/products`).then(r => r.ok ? r.json() : Promise.reject(r)),
      fetch(`${API_BASE}/api/services`).then(r => r.ok ? r.json() : Promise.reject(r)),
    ])
      .then(([p, s]) => {
        if (!alive) return;
        setProducts(Array.isArray(p) ? p : []);
        setServices(Array.isArray(s) ? s : []);
      })
      .catch(async (e) => {
        try {
          const msg = typeof e?.json === "function" ? (await e.json())?.error : e?.statusText;
          setErr(msg || "Failed to load data");
        } catch {
          setErr("Failed to load data");
        }
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const onAddToCart = (it) => {
    add(it);
    if (!localStorage.getItem("cartFirstAddShown")) {
      setFirstAdd(true);
      localStorage.setItem("cartFirstAddShown", "1");
    }
  };

  const filteredProducts = useMemo(() => {
    let list = products || [];
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(x =>
        x.name?.toLowerCase().includes(s) ||
        x.bio?.toLowerCase().includes(s)
      );
    }
    if (hideSold) list = list.filter(x => !x.sold_out);
    switch (sort) {
      case "price_asc":  list = [...list].sort((a,b) => (a.discount_price ?? a.price) - (b.discount_price ?? b.price)); break;
      case "price_desc": list = [...list].sort((a,b) => (b.discount_price ?? b.price) - (a.discount_price ?? a.price)); break;
      case "name_asc":   list = [...list].sort((a,b) => a.name.localeCompare(b.name)); break;
      default: break;
    }
    return list;
  }, [products, q, sort, hideSold]);

  const filteredServices = useMemo(() => {
    let list = services || [];
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(x =>
        x.name?.toLowerCase().includes(s) ||
        x.bio?.toLowerCase().includes(s)
      );
    }
    switch (sort) {
      case "price_asc":  list = [...list].sort((a,b) => (a.discount_price ?? a.price) - (b.discount_price ?? b.price)); break;
      case "price_desc": list = [...list].sort((a,b) => (b.discount_price ?? b.price) - (a.discount_price ?? a.price)); break;
      case "name_asc":   list = [...list].sort((a,b) => a.name.localeCompare(b.name)); break;
      default: break;
    }
    return list;
  }, [services, q, sort]);

  return (
    // IMPORTANT: pt-16 keeps page content under nav bar but its hard coded so should be fixed later :p
    <div className="bg-neutral-950 text-white min-h-screen pt-16">
      <div className="sticky top-16 z-40 bg-neutral-950/70 border-b border-white/10 backdrop-blur">
        <header className="mx-auto w-full max-w-7xl px-4 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Shop</h1>
              <p className="mt-1 text-neutral-300">Browse our products and services.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-neutral-400">
                Cart items: <span className="font-semibold text-white">{count}</span>
              </div>
              <button
                onClick={()=>setDrawer(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900/60 px-3 py-2 text-sm hover:bg-neutral-900"
              >
                <ShoppingCart size={16}/> View cart
              </button>
            </div>
          </div>
          <div className="mt-4 inline-flex rounded-lg border border-white/10 bg-neutral-900/60 p-1">
            {["products", "services"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cls(
                  "px-4 py-2 text-sm font-medium rounded-md transition",
                  tab === t ? "bg-white text-neutral-900" : "text-neutral-300 hover:text-white"
                )}
              >
                {t === "products" ? "Products" : "Services"}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or description…"
                className="w-72 rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-white/20 focus:outline-none"
              />
              {tab === "products" && (
                <label className="ml-2 inline-flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={hideSold}
                    onChange={(e) => setHideSold(e.target.checked)}
                    className="h-4 w-4 rounded border-white/10 bg-neutral-900 text-emerald-400 focus:ring-emerald-400"
                  />
                  Hide sold out
                </label>
              )}
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="w-44 rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 focus:border-white/20 focus:outline-none">
              <option value="relevance">Sort: Relevance</option>
              <option value="price_asc">Price: Low → High</option>
              <option value="price_desc">Price: High → Low</option>
              <option value="name_asc">Name: A → Z</option>
            </select>
          </div>
        </header>
      </div>
      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6">
        {err && (
          <div className="mb-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200">
            {String(err)}
          </div>
        )}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-white/5 bg-neutral-900/60 p-3">
                <div className="aspect-[4/3] w-full rounded-lg bg-neutral-800" />
                <div className="mt-3 space-y-2">
                  <div className="h-4 w-1/2 rounded bg-neutral-800" />
                  <div className="h-3 w-3/4 rounded bg-neutral-800" />
                  <div className="h-8 w-24 rounded bg-neutral-800" />
                </div>
              </div>
            ))}
          </div>
        ) : tab === "products" ? (
          filteredProducts.length ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredProducts.map((p) => (
                <Card key={`p-${p.id}`} item={p} kind="product" onAdd={onAddToCart} />
              ))}
            </div>
          ) : (
            <p className="text-neutral-400">No products found.</p>
          )
        ) : filteredServices.length ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredServices.map((s) => (
              <Card key={`s-${s.id}`} item={s} kind="service" onAdd={onAddToCart} />
            ))}
          </div>
        ) : (
          <p className="text-neutral-400">No services found.</p>
        )}
      </main>
      {firstAdd && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
          <div className="w-[min(92vw,420px)] rounded-xl border border-white/10 bg-neutral-950 p-5 text-white">
            <h3 className="text-lg font-semibold">Added to cart</h3>
            <p className="mt-1 text-sm text-neutral-300">Want to check out now or continue shopping?</p>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 rounded-lg bg-white py-2 font-semibold text-neutral-900 hover:bg-neutral-200"
                onClick={() => { setFirstAdd(false); setDrawer(true); }}>
                Go to checkout
              </button>
              <button className="flex-1 rounded-lg border border-white/15 py-2 hover:bg-white/5"
                onClick={() => setFirstAdd(false)}>
                Continue shopping
              </button>
            </div>
          </div>
        </div>
      )}
      <CartDrawer
        open={drawer}
        onClose={()=>setDrawer(false)}
        items={items}
        inc={inc}
        dec={dec}
        remove={remove}
        total={total}
      />
    </div>
  );
}
