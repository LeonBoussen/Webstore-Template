import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:5000';

// First-launch step: the temporary admin/admin account is forced to create
// the owner's real admin account here. Once created, the temporary account
// is deleted server-side and the new token takes over.
export default function Setup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', password: '', confirm: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // Only the temporary setup admin may use this page.
  useEffect(() => {
    let alive = true;
    const token = localStorage.getItem('userToken');
    if (!token) { navigate('/login'); return () => { alive = false; }; }
    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!alive) return;
        if (!me) { navigate('/login'); return; }
        if (me.role !== 'admin' || me.setup_pending !== true) {
          navigate(me.role === 'admin' ? '/admin' : '/');
        }
      })
      .catch(() => { if (alive) navigate('/login'); });
    return () => { alive = false; };
  }, [navigate]);

  const setField = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    if (form.password.length < 8) { setMsg('Password must be at least 8 characters.'); return; }
    if (form.password !== form.confirm) { setMsg('Passwords do not match.'); return; }
    const token = localStorage.getItem('userToken');
    if (!token) { navigate('/login'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: form.email, username: form.username, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data?.error || 'Setup failed'); return; }
      // The response token belongs to the new admin account.
      localStorage.setItem('userToken', data.token);
      navigate('/admin');
    } catch {
      setMsg('Network error — is the backend running?');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_10%,rgba(34,197,94,0.08),transparent_60%)]" />
      <div className="max-w-7xl mx-auto px-6 pt-28 pb-16">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-transparent bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text">
              Create your admin account
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              You are logged in with the temporary <span className="font-mono">admin</span> account.
              Create your own admin account below — the temporary one will be removed
              immediately and will stop working.
            </p>
          </div>

          <form
            onSubmit={submit}
            className="rounded-2xl bg-neutral-900/60 border border-white/10 p-6 shadow-xl backdrop-blur"
          >
            <label className="block text-sm mb-2">Email</label>
            <input
              className="w-full p-3 mb-4 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="you@example.com"
              type="email"
              value={form.email}
              onChange={setField('email')}
              required
            />

            <label className="block text-sm mb-2">Username</label>
            <input
              className="w-full p-3 mb-4 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="yourname"
              value={form.username}
              onChange={setField('username')}
              minLength={3}
              maxLength={32}
              required
            />

            <label className="block text-sm mb-2">Password</label>
            <input
              className="w-full p-3 mb-4 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={setField('password')}
              minLength={8}
              autoComplete="new-password"
              required
            />

            <label className="block text-sm mb-2">Confirm password</label>
            <input
              className="w-full p-3 mb-5 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              type="password"
              placeholder="••••••••"
              value={form.confirm}
              onChange={setField('confirm')}
              minLength={8}
              autoComplete="new-password"
              required
            />

            <button
              type="submit"
              disabled={busy}
              className="w-full p-3 rounded-full bg-cyan-600 hover:bg-cyan-500 font-semibold transition disabled:opacity-60"
            >
              {busy ? 'Creating…' : 'Create admin account'}
            </button>

            {msg && <p className="mt-3 text-sm text-neutral-200">{msg}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
