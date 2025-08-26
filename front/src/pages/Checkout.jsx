// /src/pages/Checkout.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CreditCard, Bitcoin, Banknote, QrCode, ArrowLeft, X, Plus, Minus, ShieldCheck } from "lucide-react";

const API_BASE = "http://127.0.0.1:5000";
const fmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const cls = (...x) => x.filter(Boolean).join(" ");

const isUrl = (s) => typeof s === "string" && /^https?:\/\//i.test(s);
const withBase = (u) => (!u ? null : isUrl(u) ? u : `${API_BASE}${u.startsWith("/") ? "" : "/"}${u}`);

// ------- Local cart helper (matches your Products.jsx behavior) -------
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

  const inc = (id, kind) => {
    save(items.map(it => (it.id === id && it.kind === kind ? { ...it, qty: (it.qty || 1) + 1 } : it)));
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

  const subTotal = items.reduce((sum, it) => sum + ((it.discount_price ?? it.price) || 0) * (it.qty || 1), 0);
  return { items, inc, dec, remove, clear, subTotal };
}

const firstImageOf = (item) => {
  const raw =
    item?.image1 ??
    item?.image_url ?? item?.image_path ??
    (Array.isArray(item?.image_urls) ? item.image_urls[0] : undefined) ??
    (Array.isArray(item?.gallery) ? item.gallery[0] : undefined);
  return withBase(raw || null);
};

// ------- Discount application (dev mode with clear placeholders) -------
function applyDiscountDevOnly(code, amount) {
  // DEV CODES — purely client-side for now.
  // Replace with backend validation later at /api/discounts/validate.
  const c = (code || "").trim().toUpperCase();
  if (!c) return { ok: false, reason: "No code entered" };

  // Examples:
  //   DEV10  -> 10% off
  //   SAVE5  -> €5 fixed off
  //   STUDENT15 -> 15% off
  if (c === "DEV10")       return { ok: true, type: "percent", value: 10, code: c };
  if (c === "STUDENT15")  return { ok: true, type: "percent", value: 15, code: c };
  if (c === "SAVE5")      return { ok: true, type: "fixed", value: 5,  code: c };

  return { ok: false, reason: "Unknown or inactive code (dev-only)" };
}

export default function Checkout() {
  const nav = useNavigate();
  const token = localStorage.getItem("userToken");
  const auth = token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : {};
  const { items, inc, dec, remove, clear, subTotal } = useLocalCart();

  // customer details (pre-fill from profile if logged in)
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  // discount
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState(null); // {code, type, value}
  const [promoMsg, setPromoMsg] = useState("");

  // payments
  const [method, setMethod] = useState("stripe"); // stripe | paypal | ideal | card | crypto
  const [crypto, setCrypto] = useState("btc");     // btc | xmr

  const [placing, setPlacing] = useState(false);
  const [toast, setToast] = useState("");

  // Load profile if logged in
  useEffect(() => {
    let alive = true;
    async function run() {
      if (!token) return;
      try {
        const r = await fetch(`${API_BASE}/api/user/profile`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        if (!alive) return;
        setEmail(data.email || "");
        setAddress(data.address || "");
      } catch {
        // silent
      }
    }
    run();
    return () => { alive = false; };
  }, [token]);

  const discountAmount = useMemo(() => {
    if (!promo) return 0;
    if (promo.type === "percent") return Math.max(0, Math.round((subTotal * promo.value) / 100 * 100) / 100);
    if (promo.type === "fixed")   return Math.min(subTotal, promo.value);
    return 0;
  }, [promo, subTotal]);

  const total = Math.max(0, subTotal - discountAmount);

  const onApplyPromo = async () => {
    setPromoMsg("");
    // If you add backend later, try it first:
    // const r = await fetch(`${API_BASE}/api/discounts/validate?code=${encodeURIComponent(promoInput)}`);
    // if (r.ok) { const d = await r.json(); setPromo(d); setPromoMsg("Discount applied"); return; }

    const res = applyDiscountDevOnly(promoInput, subTotal);
    if (res.ok) {
      setPromo({ code: res.code, type: res.type, value: res.value });
      setPromoMsg("Discount applied (dev mode)");
    } else {
      setPromo(null);
      setPromoMsg(res.reason || "Invalid code");
    }
  };

  const onRemovePromo = () => {
    setPromo(null);
    setPromoInput("");
    setPromoMsg("");
  };

  const placeOrder = async () => {
    if (!items.length) { setToast("Your cart is empty"); return; }
    if (!email.trim()) { setToast("Please enter an email"); return; }

    setPlacing(true);
    try {
      // Build a normalized order payload ready for server usage
      const payload = {
        customer: { email, address },
        items: items.map(it => ({
          id: it.id, kind: it.kind, name: it.name,
          unit_price: (it.discount_price ?? it.price) || 0,
          qty: it.qty || 1,
          image_url: it.image_url ?? firstImageOf(it)
        })),
        amounts: {
          subtotal: subTotal,
          discount: discountAmount,
          total
        },
        discount_code: promo?.code || null,
        payment: {
          method,
          crypto: method === "crypto" ? crypto : null
        }
      };

      // Later: POST to /api/orders and receive server-side payment intents/links
      // const r = await fetch(`${API_BASE}/api/orders`, { method: "POST", headers: { "Content-Type":"application/json", ...auth }, body: JSON.stringify(payload) });
      // const data = await r.json(); // contains payment URL or client_secret etc...
      // handle redirection/intents by method...

      console.log("[DEV] Order payload", payload);

      // For now: simulate success and clear cart
      clear();
      setToast("Order created (dev). Integrate payment next.");
      setTimeout(() => nav("/account"), 800);
    } catch (e) {
      setToast("Failed to create order");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="bg-neutral-950 text-white min-h-[100dvh] pt-16">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(40%_25%_at_70%_0%,rgba(56,189,248,0.08),transparent_60%)]" />
      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <div className="mb-4">
          <Link to="/products" className="inline-flex items-center gap-2 text-sm text-neutral-300 hover:text-white">
            <ArrowLeft size={16}/> Continue shopping
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left column: Customer + Payment */}
          <div className="lg:col-span-7 space-y-6">
            <section className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6 backdrop-blur">
              <h2 className="text-lg font-semibold">Customer</h2>
              <label className="mt-3 block text-sm text-neutral-300">Email</label>
              <input
                className="mt-1 w-full rounded-lg bg-neutral-800 border border-white/10 p-2"
                value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
              />
              <label className="mt-3 block text-sm text-neutral-300">Shipping address</label>
              <textarea
                rows={4}
                className="mt-1 w-full rounded-lg bg-neutral-800 border border-white/10 p-2"
                value={address} onChange={e => setAddress(e.target.value)}
                placeholder="Street, number&#10;Postal code, City&#10;Country"
              />
              <div className="mt-3 text-xs text-neutral-400 inline-flex items-center gap-2">
                <ShieldCheck size={14} className="text-emerald-300"/> We’ll only use this for order and delivery updates.
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6 backdrop-blur">
              <h2 className="text-lg font-semibold">Payment method</h2>
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                {[
                  { id: "stripe", label: "Stripe (recommended)", icon: <CreditCard size={16}/> },
                  { id: "paypal", label: "PayPal", icon: <Banknote size={16}/> },
                  { id: "ideal",  label: "iDEAL", icon: <QrCode size={16}/> },
                  { id: "card",   label: "Credit/Debit card", icon: <CreditCard size={16}/> },
                  { id: "crypto", label: "Crypto", icon: <Bitcoin size={16}/> },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setMethod(opt.id)}
                    className={cls(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left",
                      method === opt.id
                        ? "border-cyan-400/40 bg-cyan-500/10"
                        : "border-white/10 bg-neutral-800 hover:bg-neutral-700"
                    )}
                  >
                    {opt.icon}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>

              {method === "crypto" && (
                <div className="mt-4">
                  <div className="text-sm text-neutral-300 mb-2">Choose currency</div>
                  <div className="inline-flex rounded-lg border border-white/10 bg-neutral-900/60 p-1">
                    {[
                      { id: "btc", label: "Bitcoin" },
                      { id: "xmr", label: "Monero" },
                    ].map(c => (
                      <button
                        key={c.id}
                        onClick={() => setCrypto(c.id)}
                        className={cls(
                          "px-3 py-1.5 text-sm font-medium rounded-md transition",
                          crypto === c.id ? "bg-white text-neutral-900" : "text-neutral-300 hover:text-white"
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-neutral-400">
                    You’ll generate an address / QR after order creation (to be integrated).
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6 backdrop-blur">
              <h2 className="text-lg font-semibold">Discount code</h2>
              <div className="mt-3 flex gap-2 items-center">
                <input
                  className="flex-1 rounded-lg bg-neutral-800 border border-white/10 px-3 py-2 text-sm"
                  placeholder="Enter code (e.g., DEV10, SAVE5, STUDENT15)"
                  value={promoInput} onChange={e => setPromoInput(e.target.value)}
                />
                {promo ? (
                  <button className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm hover:bg-neutral-800"
                          onClick={onRemovePromo}>
                    Remove
                  </button>
                ) : (
                  <button className="rounded-lg bg-white text-neutral-900 px-3 py-2 text-sm font-semibold hover:bg-neutral-200"
                          onClick={onApplyPromo}>
                    Apply
                  </button>
                )}
              </div>
              {promoMsg && <div className="mt-2 text-sm text-neutral-300">{promoMsg}</div>}
              {promo && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                  <span className="font-semibold">{promo.code}</span>
                  <span>•</span>
                  <span>{promo.type === "percent" ? `${promo.value}% off` : `−${fmt.format(promo.value)}`}</span>
                </div>
              )}
            </section>
          </div>

          {/* Right column: Order summary */}
          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-24 rounded-2xl border border-white/10 bg-neutral-900/60 p-6 shadow-xl backdrop-blur">
              <h2 className="text-lg font-semibold">Order summary</h2>
              <div className="mt-3 space-y-3 max-h-[320px] overflow-auto pr-1">
                {items.length === 0 ? (
                  <div className="text-neutral-400 text-sm">Your cart is empty.</div>
                ) : items.map(it => {
                  const priceEach = (it.discount_price ?? it.price) || 0;
                  return (
                    <div key={`${it.kind}-${it.id}`} className="flex gap-3 rounded-lg border border-white/10 p-3 bg-neutral-900/60">
                      <div className="h-16 w-20 overflow-hidden rounded bg-neutral-800">
                        {firstImageOf(it) ? <img src={firstImageOf(it)} alt="" className="h-full w-full object-cover"/> : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="truncate">
                            <div className="text-sm font-semibold truncate">{it.name}</div>
                            <div className="text-xs text-neutral-400">{it.kind}</div>
                          </div>
                          <button className="text-rose-300 hover:text-rose-200" onClick={()=>remove(it.id, it.kind)} title="Remove">
                            <X size={16}/>
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

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-300">Subtotal</span>
                  <span className="font-medium">{fmt.format(subTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-neutral-300">Discount</span>
                  <span className="font-medium">{discountAmount ? `−${fmt.format(discountAmount)}` : fmt.format(0)}</span>
                </div>
                <div className="flex items-center justify-between text-base font-semibold pt-2 border-t border-white/10">
                  <span>Total</span>
                  <span>{fmt.format(total)}</span>
                </div>
              </div>

              <button
                disabled={!items.length || placing}
                onClick={placeOrder}
                className={cls(
                  "mt-4 w-full rounded-lg bg-white text-neutral-900 font-semibold py-2 hover:bg-neutral-200",
                  (!items.length || placing) && "opacity-60 cursor-not-allowed"
                )}
              >
                {placing ? "Preparing…" : "Place order"}
              </button>

              <div className="mt-3 text-xs text-neutral-400">
                Payments are not integrated yet. Clicking “Place order” creates the payload and simulates success.
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Tiny toast */}
      <div className={cls(
        "fixed right-4 bottom-4 z-[60] transition-all duration-300",
        toast ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2"
      )}>
        <div className="rounded-lg border border-white/10 bg-neutral-900/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur">
          {toast}
        </div>
      </div>
    </div>
  );
}
