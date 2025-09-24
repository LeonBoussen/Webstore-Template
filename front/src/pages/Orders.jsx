import { useEffect, useMemo, useState } from "react";
import axios from "axios";

const APIBASE = "http://127.0.0.1:5000";
const api = axios.create({ baseURL: APIBASE });

function useAuth() {
  const token = typeof window !== "undefined" ? localStorage.getItem("userToken") : null;
  const headers = useMemo(() => (token ? { Authorization: "Bearer " + token } : {}), [token]);
  return { token, headers };
}

const STATUS_OPTIONS = ["ordered", "confirmed", "shipped", "delivered"];

export default function Orders() {
  const { token, headers } = useAuth();
  const [allowed, setAllowed] = useState(null);
  const [msg, setMsg] = useState("");
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(false);

  // Auth check, only show if admin
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) {
        alive && setAllowed(false);
        alive && setMsg("Please log in.");
        return;
      }
      try {
        const meRes = await api.get("/api/auth/me", { headers });
        if (!meRes.data.username || meRes.data.username !== "LeonBoussen") {
          setAllowed(false);
          setMsg("Admin access is restricted.");
          return;
        }
        if (alive) setAllowed(true);
      } catch (e) {
        if (!alive) return;
        setAllowed(false);
        setMsg("Session expired. Please log in again.");
      }
    })();
    return () => { alive = false; };
  }, [token]);

  // Load orders after admin validation
  useEffect(() => {
    if (allowed) loadOrders();
    // eslint-disable-next-line
  }, [allowed]);

  async function loadOrders() {
    setBusy(true);
    try {
      const res = await api.get("/api/orders", { headers });
      setOrders(res.data || []);
    } finally {
      setBusy(false);
    }
  }

  // Update order, then reload to get the latest data
  async function handleUpdate(orderId, payload) {
    setBusy(true);
    try {
      await api.put(`/api/orders/${orderId}`, payload, { headers });
      await loadOrders();
    } finally {
      setBusy(false);
    }
  }

  if (allowed === null)
    return <div className="min-h-screen flex items-center justify-center pt-24">Checking access...</div>;
  if (!allowed)
    return <div className="min-h-screen flex items-center justify-center text-red-500 pt-24">{msg}</div>;

  return (
    <div className="min-h-screen bg-neutral-950 text-white px-4 pt-24 pb-8">
      <h1 className="text-2xl font-semibold mb-5">Orders Management</h1>
      <div className="space-y-7">
        {orders.length === 0
          ? <div>No orders found.</div>
          : orders.map(order => (
          <div key={order.id} className="rounded-xl bg-neutral-900/60 border border-white/10 p-5 shadow-lg flex flex-col gap-2">
            <div className="flex flex-wrap gap-4 items-center">
              <span className="font-bold">Order #{order.id}</span>
              <span>User: <b>{order.username}</b> ({order.email})</span>
              <span>Status:&nbsp;
                <select
                  className="bg-neutral-800 rounded px-3 py-1"
                  value={order.status}
                  disabled={busy}
                  onChange={e => handleUpdate(order.id, {status: e.target.value})}
                >
                  {STATUS_OPTIONS.map(status =>
                    <option key={status} value={status}>{status}</option>
                  )}
                </select>
              </span>
              <span>Shipping Date: <input
                className="bg-neutral-800 rounded px-2 py-1 w-32"
                type="date"
                value={order.shippingdate || ""}
                disabled={busy}
                onChange={e => handleUpdate(order.id, {shippingdate: e.target.value})}
              /></span>
              <span>
                Track &amp; Trace:
                <input
                  className="bg-neutral-800 ml-2 rounded px-2 py-1 w-60"
                  type="text"
                  value={order.tracktracelink || ""}
                  disabled={busy}
                  onBlur={e => handleUpdate(order.id, {tracktracelink: e.target.value})}
                  onChange={e => setOrders(orders.map(o =>
                    o.id === order.id ? { ...o, tracktracelink: e.target.value } : o
                  ))}
                  placeholder="Add link"
                />
              </span>
            </div>
            <div className="text-sm ml-2">
              Products:
              <ul className="ml-4 list-disc">
                {(order.items || []).map(item =>
                  <li key={item.id}>#{item.productid} {item.name} &times; 1 &mdash; €{item.price}</li>
                )}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
