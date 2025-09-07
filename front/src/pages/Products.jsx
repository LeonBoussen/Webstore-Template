import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, Trash2, ShoppingCart, X } from "lucide-react";
import { Link } from "react-router-dom";

const API_BASE = "http://127.0.0.1:5000";
const fmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const cls = (...x) => x.filter(Boolean).join(" ");
const percentOff = (price, discount) =>
  discount && discount < price ? Math.round(100 - (discount / price) * 100) : 0;
const isUrl = (s) => typeof s === "string" && /^https?:\/\//i.test(s);
const PRESS = "transition-transform duration-150 motion-reduce:transition-none motion-safe:active:scale-95";
const withBase = (u) => (!u ? null : isUrl(u) ? u : `${API_BASE}${u.startsWith("/") ? "" : "/"}${u}`);
const firstImageOf = (item) => {
  const raw =
    item?.image1 ??
    item?.image_url ?? item?.image_path ??
    (Array.isArray(item?.image_urls) ? item.image_urls[0] : undefined) ??
    (Array.isArray(item?.gallery) ? item.gallery[0] : undefined);
  return withBase(raw || null);
};

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
    else arr.push({
      id: item.id, kind: item.kind, name: item.name,
      price: item.price, discount_price: item.discount_price,
      image_url: item.image_url ?? firstImageOf(item), qty: 1
    });
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
  const img = firstImageOf(item);
  const badges = [
    limited_edition ? { text: "Limited", tone: "amber" } : null,
    sold_out ? { text: "Sold out", tone: "rose" } : null,
  ].filter(Boolean);

  return (
    <div className="group relative flex flex-col rounded-xl border border-white/5 bg-neutral-900/60 p-3 shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] ring-1 ring-black/40 backdrop-blur transition hover:border-white/10 hover:bg-neutral-900">
      <Link to={`/product/${item.id}`} state={{ product: item }} aria-label={`Open ${name}`}>
        <ImageBox src={img} alt={name} />
      </Link>
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold leading-tight text-white">
            <Link to={`/product/${item.id}`} state={{ product: item }} className="hover:text-cyan-300">
              {name}
            </Link>
          </h3>
          <div className="flex shrink-0 gap-1">
            {badges.map((b, i) => (
              <Ribbon key={i} tone={b.tone}>{b.text}</Ribbon>
            ))}
          </div>
        </div>
        {bio && <p className="text-sm text-neutral-300 max-h-12 overflow-hidden">{bio}</p>}
        <div className="mt-2 flex items-center justify-between">
          <Price price={price} discount={discount_price} />
          <button
            onClick={(e) => onAdd({ ...item, kind }, e.currentTarget)}
            disabled={!!sold_out}
            className={cls(
              // container & baseline styles
              "relative overflow-hidden group rounded-lg px-3 py-2 text-sm font-semibold",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60",
              "touch-manipulation select-none",
              PRESS, // press/tap animation
              // enabled/disabled colors
              sold_out
                ? "cursor-not-allowed bg-neutral-800 text-neutral-500"
                : "bg-white text-neutral-900 hover:bg-neutral-200"
            )}
          >
            {/* keep content above the animated outline */}
            <span className="relative z-10">
              {sold_out ? "Unavailable" : "Add to cart"}
            </span>

            {/* smooth fade + draw outline overlay */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-lg
                        ring-2 ring-current
                        opacity-0 scale-x-0 origin-left
                        transition-[opacity,transform] duration-500 ease-out
                        group-hover:opacity-100 group-hover:scale-x-100
                        group-focus-visible:opacity-100 group-focus-visible:scale-x-100"
            />
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
          const img = firstImageOf(it);
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
      <div className="border-t border-white/10 -mt-4 bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950  relative z-50">
        <div className="flex items-center justify-between">
          <span className="text-neutral-300">Total</span>
          <span className="text-lg font-semibold">{fmt.format(total)}</span>
        </div>
        <Link to="/checkout" className="mt-3 block w-full rounded-lg bg-white text-neutral-900 text-center font-semibold py-2 hover:bg-neutral-200">
          Go to checkout
        </Link>
      </div>
    </aside>
  </>
);

function Toast({ show, children }) {
  return (
    <div className={cls(
      "fixed right-4 bottom-4 z-[60] transition-all duration-300",
      show ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2"
    )}>
      <div className="rounded-lg border border-white/10 bg-neutral-900/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur">
        {children}
      </div>
    </div>
  );
}

function FirstAddModal({ show, onClose, onGoToCart }) {
  return (
    <div
      className={cls(
        "fixed inset-0 z-[70] transition",
        show ? "opacity-100" : "pointer-events-none opacity-0"
      )}
      aria-hidden={!show}
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-950 text-white shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h3 className="text-base font-semibold">Added to your cart</h3>
            <button onClick={onClose} className="rounded-full p-2 bg-neutral-800 hover:bg-neutral-700">
              <X size={16} />
            </button>
          </div>
          <div className="px-4 py-4 text-sm text-neutral-300">
            Nice! Your item is in the cart. You can keep shopping or go to the cart to review and checkout.
          </div>
          <div className="flex items-center gap-2 px-4 pb-4">
            <button
              onClick={onGoToCart}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-200"
            >
              <ShoppingCart size={16}/> View cart
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm text-white hover:bg-neutral-800"
            >
              Keep shopping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Add to card animation*/
function flyToCart(startEl, endEl, imgSrc) {
  if (!startEl || !endEl) return;
  const s = startEl.getBoundingClientRect();
  const e = endEl.getBoundingClientRect();

  const flyer = document.createElement("img");
  flyer.src = imgSrc || "";
  flyer.alt = "";
  flyer.style.position = "fixed";
  flyer.style.left = `${s.left + s.width / 2 - 16}px`;
  flyer.style.top = `${s.top + s.height / 2 - 16}px`;
  flyer.style.width = "32px";
  flyer.style.height = "32px";
  flyer.style.objectFit = "cover";
  flyer.style.borderRadius = "8px";
  flyer.style.boxShadow = "0 6px 20px rgba(0,0,0,.35)";
  flyer.style.zIndex = "9999";
  flyer.style.opacity = "0.95";
  flyer.style.transform = "translate(0, 0) scale(1)";
  flyer.style.transition = "transform 600ms cubic-bezier(.22,.61,.36,1), opacity 600ms cubic-bezier(.22,.61,.36,1)";

  document.body.appendChild(flyer);

  requestAnimationFrame(() => {
    const dx = (e.left + e.width / 2) - (s.left + s.width / 2);
    const dy = (e.top + e.height / 2) - (s.top + s.height / 2);
    flyer.style.transform = `translate(${dx}px, ${dy}px) scale(0.6)`;
    flyer.style.opacity = "0.1";
  });

  const cleanup = () => flyer.parentElement && flyer.parentElement.removeChild(flyer);
  flyer.addEventListener("transitionend", cleanup, { once: true });
}

export default function Products() {
  const { items, add, inc, dec, remove, clear, count, total } = useLocalCart();
  const [drawer, setDrawer] = useState(false);

  const [tab, setTab] = useState("products");
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("relevance");
  const [hideSold, setHideSold] = useState(true);

  // Feedback states
  const [toast, setToast] = useState(false);
  const [badgeBump, setBadgeBump] = useState(false);
  const cartBtnRef = useRef(null);

  // First-add modal (PERSISTED)
  const [firstAdd, setFirstAdd] = useState(() => {
    try { return localStorage.getItem("firstAddSeen") === "1" ? false : true; }
    catch { return true; }
  });

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

  // Add to cart with animations & modal
  const onAddToCart = (it, startEl) => {
    add(it);

    // Fly image to cart button
    const imgSrc = firstImageOf(it);
    if (startEl && cartBtnRef.current) {
      flyToCart(startEl, cartBtnRef.current, imgSrc);
    }

    // Bump the badge
    setBadgeBump(true);
    setTimeout(() => setBadgeBump(false), 250);

    // First time: show modal
    if (firstAdd) {
      setFirstAdd(true); 
    } else {
      setToast(true);
      setTimeout(() => setToast(false), 1800);
    }
  };

  const markFirstAddSeen = () => {
    try { localStorage.setItem("firstAddSeen", "1"); } catch {}
    setFirstAdd(false);
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
    <div className="bg-neutral-950 text-white min-h-[100dvh] pt-16 overflow-x-hidden">
      <div className="top-16 z-40 bg-neutral-950/70 border-b border-white/10 backdrop-blur">
        <header className="mx-auto w-full max-w-7xl px-4 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Shop</h1>
              <p className="mt-1 text-neutral-300">Browse our products and services.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-neutral-400">
                Cart items:{" "}
                <span className={cls(
                  "inline-flex min-w-6 items-center justify-center rounded px-1.5 font-semibold text-white transition-transform",
                  badgeBump && "scale-110"
                )}>
                  {count}
                </span>
              </div>
              <button
                ref={cartBtnRef}
                onClick={()=>setDrawer(true)}
                className={cls(
                  "relative inline-flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900/60 px-3 py-2 text-sm hover:bg-neutral-900 transition-transform",
                  badgeBump && "scale-105"
                )}
              >
                <ShoppingCart size={16}/> View cart
                <span
                  className={cls(
                    "absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[11px] font-semibold text-neutral-900",
                    "transition-transform",
                    badgeBump && "scale-110"
                  )}
                  aria-label="Items in cart"
                  title={`${count} item(s)`}
                >
                  {count}
                </span>
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

      <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-24">
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

      <Toast show={toast}>✅ Added to cart</Toast>

      <FirstAddModal
        show={firstAdd && count > 0}
        onClose={() => { markFirstAddSeen(); }}
        onGoToCart={() => { markFirstAddSeen(); setDrawer(true); }}
      />

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
