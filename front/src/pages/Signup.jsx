import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [username, setUser] = useState('');
  const [password, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const { data } = await axios.post('http://127.0.0.1:5000/api/auth/signup', { email, username, password });
      localStorage.setItem('userToken', data.token);
      setMsg('✅ Account created! You are now logged in.');
      setShowSuccess(true); // show or not show signup success pop up
    } catch (e) {
      setMsg(e?.response?.data?.error || 'Error');
    }
  };

  const goProducts = () => navigate('/products');
  const goAccount = () => navigate('/account');
  const dismissToHome = () => navigate('/');

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_10%,rgba(34,197,94,0.08),transparent_60%)]" />
      <div className="max-w-7xl mx-auto px-6 pt-28 pb-16">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-transparent bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text">
              Create your account
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Join us and get access to products, orders, and more.
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
              value={email}
              onChange={e=>setEmail(e.target.value)}
              type="email"
              required
            />

            <label className="block text-sm mb-2">Username</label>
            <input
              className="w-full p-3 mb-4 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              placeholder="yourname"
              value={username}
              onChange={e=>setUser(e.target.value)}
              required
            />

            <label className="block text-sm mb-2">Password</label>
            <input
              className="w-full p-3 mb-5 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e=>setPass(e.target.value)}
              minLength={6}
              required
            />

            <button
              type="submit"
              className="w-full p-3 rounded-full bg-cyan-600 hover:bg-cyan-500 font-semibold transition"
            >
              Sign up
            </button>

            {msg && <p className="mt-3 text-sm text-neutral-200">{msg}</p>}

            <p className="mt-4 text-sm text-neutral-400 text-center">
              Already have an account?{' '}
              <Link
                to="/login"
                className="underline underline-offset-4 decoration-cyan-400 hover:text-white"
              >
                Log in
              </Link>
            </p>
          </form>
        </div>
      </div>
      {showSuccess && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissToHome();
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-md rounded-2xl bg-neutral-900 border border-white/10 p-6 shadow-2xl">
            <button
              onClick={dismissToHome}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-full p-1 text-neutral-400 hover:text-white hover:bg-white/10 transition"
              type="button"
            >
              ✕
            </button>
            <div className="text-center">
              <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
                <span className="text-2xl">✅</span>
              </div>
              <h2 className="text-xl font-semibold">Signup successful</h2>
              <p className="mt-2 text-sm text-neutral-400">
                Your account is ready. Where do you want to go next?
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={goProducts}
                  className="w-full rounded-lg px-4 py-2 bg-cyan-600 hover:bg-cyan-500 font-semibold transition"
                  type="button"
                >
                  Go to products
                </button>
                <button
                  onClick={goAccount}
                  className="w-full rounded-lg px-4 py-2 bg-neutral-800 border border-white/10 hover:bg-neutral-700 font-semibold transition"
                  type="button"
                >
                  Go to account
                </button>
              </div>
              <p className="mt-4 text-xs text-neutral-500">
                Or click outside this box to return home.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
