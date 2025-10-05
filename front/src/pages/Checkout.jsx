// /src/pages/Checkout.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bitcoin, ArrowLeft, X, Plus, Minus, ShieldCheck } from "lucide-react";

const API_BASE = "http://127.0.0.1:5000";
const fmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const cls = (...x) => x.filter(Boolean).join(" ");
const isUrl = (s) => typeof s === "string" && /^https?:\/\//i.test(s);
const withBase = (u) =>
  !u ? null : isUrl(u) ? u : `${API_BASE}${u.startsWith("/") ? "" : "/"}${u}`;

// ------- Local cart helper -------
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

  const subTotal = items.reduce(
    (sum, it) => sum + ((it.discount_price ?? it.price) || 0) * (it.qty || 1),
    0
  );
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

// --- NOWPayments Integration example ---
async function createNowPaymentsInvoice({ items, promo, email }) {
  // Compute total (including discount)
  let subTotal = items.reduce((sum, it) => sum + ((it.discount_price ?? it.price) || 0) * (it.qty || 1), 0);
  let discount = 0;
  if (promo?.type === "percent") discount = (subTotal * promo.value) / 100;
  if (promo?.type === "fixed") discount = promo.value;
  const total = Math.max(0, subTotal - discount);

  // Description for invoice
  const description = items.map(it => `${it.qty}x ${it.name}`).join(", ");

  // Call local backend, which performs NowPayments invoice creation for security
  const res = await fetch(`${API_BASE}/api/nowpayments/create-invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: total,
      currency: "eur",
      email,
      description,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json(); // Should include payment_url or invoice info.
}

export default function Checkout() {
  const nav = useNavigate();
  const token = localStorage.getItem("userToken");
  const { items, inc, dec, remove, clear, subTotal } = useLocalCart();

  // customer details (pre-fill from profile if logged in)
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");

  // discount
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState(null); // {code, type, value}
  const [promoMsg, setPromoMsg] = useState("");

  // payments
  const [method, setMethod] = useState("paypal"); // paypal | crypto
  const [crypto, setCrypto] = useState("btc");     // btc | xmr

  const [placing, setPlacing] = useState(false);
  const [toast, setToast] = useState("");

  // PayPal sdk/config
  const [ppConfig, setPpConfig] = useState(null);
  const paypalDivRef = useRef(null);
  const paypalSdkLoadedRef = useRef(false);
  const lastSdkKeyRef = useRef("");

  const onApplyPromo = async () => {
    const r = await fetch(`${API_BASE}/api/discount`)
    console.log(r)
  }

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

  // ---- PayPal: fetch config when selected ----
  useEffect(() => {
    let stop = false;
    async function fetchCfg() {
      if (method !== "paypal") return;
      try {
        const r = await fetch(`${API_BASE}/api/paypal/config`);
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Failed to load PayPal config");
        if (!stop) setPpConfig(data);
      } catch (e) {
        setToast("PayPal config error");
      }
    }
    fetchCfg();
    return () => { stop = true; };
  }, [method]);

  // ---- PayPal: load SDK & render buttons whenever (method=paypal) and inputs change ----
  useEffect(() => {
    if (method !== "paypal") return;
    if (!ppConfig?.client_id) return;
    const key = `${ppConfig.client_id}|${ppConfig.currency || "EUR"}`;
    const needReload = lastSdkKeyRef.current !== key;
    lastSdkKeyRef.current = key;

    const renderButtons = () => {
      if (!window.paypal || !paypalDivRef.current) return;
      paypalDivRef.current.innerHTML = "";
      window.paypal.Buttons({
        style: { layout: "vertical" },
        createOrder: async () => {
          const payload = {
            items: items.map(it => ({ id: it.id, kind: it.kind, qty: it.qty || 1 })),
            discount_code: promo?.code || null
          };
          const res = await fetch(`${API_BASE}/api/paypal/create-order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok || !data?.id) {
            throw new Error(data?.error || "Failed to create order");
          }
          return data.id;
        },
        onApprove: async (data) => {
          const res = await fetch(`${API_BASE}/api/paypal/capture-order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: data.orderID }),
          });
          const out = await res.json();
          if (!res.ok || !out?.ok) {
            setToast("PayPal capture failed");
            return;
          }
          setToast("Payment completed");
          clear();
          setTimeout(() => nav("/account"), 800);
        },
        onError: (err) => {
          setToast("PayPal error");
        }
      }).render(paypalDivRef.current);
    };

    const loadSdk = () => {
      if (paypalSdkLoadedRef.current && !needReload && window.paypal) {
        renderButtons();
        return;
      }
      const prev = document.getElementById("paypal-sdk");
      if (prev) prev.remove();

      const s = document.createElement("script");
      s.id = "paypal-sdk";
      const params = new URLSearchParams({
        "client-id": ppConfig.client_id,
        currency: (ppConfig.currency || "EUR"),
        components: "buttons"
      });
      s.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
      s.onload = () => {
        paypalSdkLoadedRef.current = true;
        renderButtons();
      };
      s.onerror = () => setToast("Failed to load PayPal");
      document.body.appendChild(s);
    };

    loadSdk();
  }, [method, ppConfig, JSON.stringify(items), promo?.code, nav, clear]);

  // --- NowPayments payment handler ---
  const payWithCrypto = async () => {
    if (!items.length || !email.trim()) {
      setToast("Cart and email required");
      return;
    }
    setPlacing(true);
    try {
      const invoice = await createNowPaymentsInvoice({ items, promo, email });
      setToast("Redirecting for crypto payment...");
      clear();
      window.location.href = invoice.payment_url;
    } catch (e) {
      setToast(`Crypto payment error: ${e.message}`);
    } finally {
      setPlacing(false);
    }
  };

  const discountAmount = 0
  const total = 42069

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
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { id: "paypal", label: "PayPal", icon: <Bitcoin size={16}/> },
                  { id: "crypto", label: "Crypto (NowPayments)", icon: <Bitcoin size={16}/> },
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
            </section>

            {method === "paypal" && (
              <section className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6 backdrop-blur">
                <h2 className="text-lg font-semibold mb-3">Pay with PayPal</h2>
                <div ref={paypalDivRef} id="paypal-buttons" />
                <div className="mt-2 text-xs text-neutral-400">
                  After approval, we’ll capture the payment and finalize your order automatically.
                </div>
              </section>
            )}

            {method === "crypto" && (
              <section className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6 backdrop-blur">
                <h2 className="text-lg font-semibold mb-3">Pay with Crypto (NowPayments)</h2>
                <div className="mt-3 space-y-2">
                  <button
                    className={cls(
                      "w-full rounded-lg bg-cyan-400 text-neutral-900 font-semibold py-2 hover:bg-cyan-300",
                      (!items.length || placing || !email.trim()) && "opacity-60 cursor-not-allowed"
                    )}
                    disabled={!items.length || placing || !email.trim()}
                    onClick={payWithCrypto}
                  >
                    {placing ? "Redirecting…" : "Continue to payment"}
                  </button>
                  <div className="text-xs text-neutral-400">
                    You will be redirected to NowPayments to complete payment. Invoice is for total after discount.
                  </div>
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6 backdrop-blur">
              <h2 className="text-lg font-semibold">Discount code</h2>
              <div className="mt-3 flex gap-2 items-center">
                <input
                  className="flex-1 rounded-lg bg-neutral-800 border border-white/10 px-3 py-2 text-sm"
                  placeholder="Enter code (e.g., DEV100)"
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
