import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation, useNavigate, Link } from "react-router-dom";
import {
  Plus, Minus, ShoppingCart, Zap, ShieldCheck, Truck, RefreshCcw,
  ChevronLeft, ChevronRight, Star
} from "lucide-react";

const API_BASE = "http://127.0.0.1:5000";
const fmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const isUrl = (s) => typeof s === "string" && /^https?:\/\//i.test(s);
const withBase = (u) => (!u ? null : isUrl(u) ? u : `${API_BASE}${u.startsWith("/") ? "" : "/"}${u}`);
const PRESS = "transition-transform duration-150 motion-reduce:transition-none motion-safe:active:scale-95";

const percentOff = (price, discount) =>
  discount && discount < price ? Math.round(100 - (discount / price) * 100) : 0;

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

  const add = (item, qty = 1) => {
    const arr = [...items];
    const i = arr.findIndex((c) => c.id === item.id && c.kind === item.kind);
    if (i >= 0) arr[i] = { ...arr[i], qty: (arr[i].qty || 1) + qty };
    else arr.push({
      id: item.id, kind: item.kind, name: item.name, price: item.price,
      discount_price: item.discount_price, image_url: item.image_url, qty
    });
    save(arr);
  };

  return { add };
}

const Price = ({ price, discount, large = false }) => {
  const off = percentOff(price, discount);
  if (discount && discount < price) {
    return (
      <div className="flex items-center gap-2">
        <span className={`${large ? "text-3xl" : "text-lg"} font-semibold text-emerald-400`}>
          {fmt.format(discount)}
        </span>
        <span className={`${large ? "text-lg" : "text-sm"} line-through text-neutral-400`}>
          {fmt.format(price)}
        </span>
        {off > 0 && (
          <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-300">
            −{off}%
          </span>
        )}
      </div>
    );
  }
  return (
    <span className={`${large ? "text-3xl" : "text-lg"} font-semibold text-white`}>
      {fmt.format(price)}
    </span>
  );
};

const Badge = ({ children }) => (
  <span className="inline-flex items-center rounded-md bg-cyan-500/10 text-cyan-300 px-2 py-1 text-xs font-semibold">
    {children}
  </span>
);

// Prefer server-provided p.images if present; otherwise fall back to common fields.
function buildGallery(p) {
  const arr = Array.isArray(p?.images)      ? p.images
           : Array.isArray(p?.image_urls)   ? p.image_urls
           : Array.isArray(p?.gallery)      ? p.gallery
           : [p?.image1, p?.image2, p?.image3, p?.image_url, p?.image_url2, p?.image_url3, p?.image_path].filter(Boolean);
  return arr.map(withBase).filter(Boolean);
}

const Gallery = ({ images = [], alt = "" }) => {
  const [i, setI] = useState(0);
  const at = (n) => (n + images.length) % images.length;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") setI((x) => at(x - 1));
      if (e.key === "ArrowRight") setI((x) => at(x + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images.length]);

  if (!images.length) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-neutral-800 grid place-items-center">
        <div className="text-neutral-400">No image</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-neutral-800">
        <img
          key={images[i]}
          src={images[i]}
          alt={alt}
          className="h-full w-full object-cover transition-transform duration-500"
          loading="eager"
          decoding="async"
        />
        <button
          type="button"
          onClick={() => setI((x) => at(x - 1))}
          className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/40 p-2 backdrop-blur hover:bg-black/60 ${PRESS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60`}
          aria-label="Previous image"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => setI((x) => at(x + 1))}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/40 p-2 backdrop-blur hover:bg-black/60"
          aria-label="Next image"
        >
          <ChevronRight size={18} />
        </button>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/10" />
      </div>

      {images.length > 1 && (
        <div className="overflow-x-auto">
          <div className="flex gap-2">
            {images.map((src, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => setI(idx)}
                className={`relative w-24 flex-none aspect-[4/3] overflow-hidden rounded-lg bg-neutral-800 ring-1 ring-white/10 ${
                  i === idx
                    ? "ring-2 ring-cyan-400 ring-offset-2 ring-offset-neutral-900"
                    : ""
                }`}
                aria-label={`Image ${idx + 1}`}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function ProductDetails() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { add } = useLocalCart();

  const [product, setProduct] = useState(location.state?.product || null);
  const [loading, setLoading] = useState(!location.state?.product);
  const [err, setErr] = useState("");
  const [qty, setQty] = useState(1);

  // Always ensure we have the full product (incl. images) from /api/products/:id.
  useEffect(() => {
    let alive = true;

    const shouldFetch =
      !product || !(Array.isArray(product.images) && product.images.length > 1);

    async function fetchDetail() {
      setErr("");
      setLoading(true);
      try {
        const byId = await fetch(`${API_BASE}/api/products/${id}`);
        if (byId.ok) {
          const data = await byId.json();
          if (alive) setProduct(data);
        } else {
          // Fallback to list (older backends / products that where made before the database update for multi images)
          const list = await fetch(`${API_BASE}/api/products`);
          const arr = list.ok ? await list.json() : [];
          const p = Array.isArray(arr) ? arr.find((x) => String(x.id) === String(id)) : null;
          if (alive) setProduct(p ?? null);
          if (!p) setErr("Product not found");
        }
      } catch (e) {
        if (alive) setErr("Failed to load product");
      } finally {
        if (alive) setLoading(false);
      }
    }

    if (shouldFetch) fetchDetail();
    return () => { alive = false; };
    // Intentionally NOT depending on `product` to avoid loops; we only fetch when landing.
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const gallery = useMemo(() => buildGallery(product || {}), [product]);
  const soldOut = !!product?.sold_out;
  const limited = !!product?.limited_edition;
  const price = product?.price ?? 0;
  const deal = product?.discount_price;

  const onAdd = () => {
    if (!product || qty < 1) return;
    add(
      {
        id: product.id,
        kind: "product",
        name: product.name,
        price: product.price,
        discount_price: product.discount_price,
        image_url: product.image_url,
      },
      qty
    );
  };

  const onBuyNow = () => {
    onAdd();
    navigate("/checkout");
  };

  return (
    <div className="bg-neutral-950 text-white min-h-screen pt-16">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(40%_25%_at_70%_0%,rgba(56,189,248,0.08),transparent_60%)]" />

      <main className="mx-auto w-full max-w-7xl px-4 pb-20">
        <nav className="pt-6 text-sm text-neutral-400">
          <Link to="/" className="hover:text-white">Home</Link>
          <span className="mx-2 text-neutral-600">/</span>
          <Link to="/products" className="hover:text-white">Products</Link>
          <span className="mx-2 text-neutral-600">/</span>
          <span className="text-neutral-200">{product?.name || "…"}</span>
        </nav>

        {err && (
          <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200">
            {String(err)}
          </div>
        )}

        {loading ? (
          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7 space-y-3">
              <div className="aspect-[4/3] rounded-2xl bg-neutral-800 animate-pulse" />
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="aspect-[4/3] rounded-lg bg-neutral-800 animate-pulse" />
                ))}
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6 backdrop-blur animate-pulse h-[420px]" />
            </div>
          </div>
        ) : product ? (
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <Gallery images={gallery} alt={product.name} />
            </div>

            <aside className="lg:col-span-5">
              <div className="lg:sticky lg:top-24 rounded-2xl border border-white/10 bg-neutral-900/60 p-6 shadow-xl backdrop-blur">
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
                  <div className="flex gap-2">
                    {limited && <Badge>Limited</Badge>}
                    {soldOut && <Badge>Sold out</Badge>}
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2 text-sm text-neutral-400">
                  <Star size={16} className="opacity-70" />
                  Trusted by creators & SMBs
                </div>

                <div className="mt-4">
                  <Price price={price} discount={deal} large />
                </div>

                {product.bio && (
                  <p className="mt-3 text-sm text-neutral-300">{product.bio}</p>
                )}

                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <label htmlFor="qty" className="text-sm text-neutral-300">Quantity</label>
                    <div className="inline-flex items-center rounded-lg border border-white/10 bg-neutral-800">
                      <button
                        className="h-10 w-10 inline-grid place-items-center hover:bg-neutral-700 rounded-l-lg"
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        aria-label="Decrease quantity"
                      >
                        <Minus size={16} />
                      </button>
                      <input
                        id="qty"
                        value={qty}
                        onChange={(e) => {
                          const n = Number(e.target.value.replace(/\D+/g, "")) || 1;
                          setQty(Math.min(99, Math.max(1, n)));
                        }}
                        className="w-12 bg-transparent text-center outline-none"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-label="Quantity"
                      />
                      <button
                        className="h-10 w-10 inline-grid place-items-center hover:bg-neutral-700 rounded-r-lg"
                        onClick={() => setQty((q) => Math.min(99, q + 1))}
                        aria-label="Increase quantity"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={onBuyNow}
                      disabled={soldOut}
                      className={`relative flex-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 font-semibold
                        bg-gradient-to-r from-cyan-500 via-emerald-400 to-cyan-500 text-white
                        hover:opacity-95 overflow-hidden group
                        touch-manipulation select-none
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60
                        ${PRESS}
                        ${soldOut ? "opacity-50 cursor-not-allowed" : ""}
                      `}
                      style={{ boxShadow: "0 0 24px rgba(56,189,248,0.25)" }}
                      aria-label="Buy now"
                    >
                      {/* content stays above the animated outline */}
                      <span className="relative z-10 inline-flex items-center gap-2">
                        <Zap size={18} /> Buy now
                      </span>

                      {/* smooth fade + draw outline */}
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-full
                                  ring-2 ring-current
                                  opacity-0 scale-x-0 origin-left
                                  transition-[opacity,transform] duration-500 ease-out
                                  group-hover:opacity-100 group-hover:scale-x-100
                                  group-focus-visible:opacity-100 group-focus-visible:scale-x-100"
                      />
                    </button>

                    <button
                      onClick={onAdd}
                      disabled={soldOut}
                      className={`relative flex-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 font-semibold
                        bg-white text-neutral-900 hover:bg-neutral-200
                        overflow-hidden group
                        touch-manipulation select-none
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60
                        ${PRESS}
                        ${soldOut ? "opacity-50 cursor-not-allowed" : ""}
                      `}
                      aria-label="Add to cart"
                    >
                      <span className="relative z-10 inline-flex items-center gap-2">
                        <ShoppingCart size={18} /> Add to cart
                      </span>

                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 rounded-full
                                  ring-2 ring-current
                                  opacity-0 scale-x-0 origin-left
                                  transition-[opacity,transform] duration-500 ease-out
                                  group-hover:opacity-100 group-hover:scale-x-100
                                  group-focus-visible:opacity-100 group-focus-visible:scale-x-100"
                      />
                    </button>

                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-neutral-300">
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900/50 px-3 py-2">
                      <ShieldCheck size={16} className="text-emerald-300" />
                      Secure checkout
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900/50 px-3 py-2">
                      <Truck size={16} className="text-cyan-300" />
                      Fast delivery
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-neutral-900/50 px-3 py-2">
                      <RefreshCcw size={16} className="text-emerald-300" />
                      14-day returns
                    </div>
                  </div>
                </div>
              </div>

              <section className="mt-6 rounded-2xl border border-white/10 bg-neutral-900/40 p-6">
                <h2 className="text-lg font-semibold">Details</h2>
                {product.description ? (
                  <p className="mt-2 text-sm text-neutral-300 whitespace-pre-line">
                    {product.description}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-neutral-400">
                    Built with performance, privacy, and reliability in mind.
                  </p>
                )}
              </section>
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  );
}
