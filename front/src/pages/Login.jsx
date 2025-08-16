import { useState } from 'react';
import axios from 'axios';
import { Link, useNavigate  } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const { data } = await axios.post('http://127.0.0.1:5000/api/auth/login', { email, password });
      localStorage.setItem('userToken', data.token);
      setMsg('✅ Logged in!');
      navigate('/products');
    } catch (e) {
      setMsg(e?.response?.data?.error || 'Error');
    }
  };

  return (
    <div className="h-screen  bg-neutral-950 text-white"    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_10%,rgba(34,197,94,0.08),transparent_60%)]" />
      <div className="max-w-7xl mx-auto px-6 pt-28 pb-16">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-transparent bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              Log in to manage your account and orders.
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

            <label className="block text-sm mb-2">Password</label>
            <input
              className="w-full p-3 mb-5 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e=>setPass(e.target.value)}
              required
            />

            <button
              className="w-full p-3 rounded-full bg-cyan-600 hover:bg-cyan-500 font-semibold transition"
            >
              Log in
            </button>

            {msg && <p className="mt-3 text-sm text-neutral-200">{msg}</p>}

            <p className="mt-4 text-sm text-neutral-400 text-center">
              Don’t have an account?{' '}
              <Link
                to="/signup"
                className="underline underline-offset-4 decoration-cyan-400 hover:text-white"
              >
                Create one
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
