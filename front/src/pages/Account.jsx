import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://127.0.0.1:5000';

export default function Account() {
  const nav = useNavigate();
  const token = localStorage.getItem('userToken');
  const auth = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {};
  const [me, setMe] = useState({ email: '', username: '', address: '' });
  const [pwd, setPwd] = useState({ current_password: '', new_password: '', confirm: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const run = async () => {
      if (!token) return nav('/login');
      try {
        const r = await fetch(`${API_BASE}/api/user/profile`, { headers: { Authorization: `Bearer ${token}` }});
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        setMe({ email: data.email || '', username: data.username || '', address: data.address || '' });
      } catch (e) {
        setMsg('Failed to load profile');
      }
    };
    run();
  }, [token]);

  const saveProfile = async () => {
    setMsg('');
    try {
      const r = await fetch(`${API_BASE}/api/user/profile`, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({ email: me.email, address: me.address })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Update failed');
      setMsg('Profile updated');
    } catch (e) { setMsg(e.message); }
  };

  const changePassword = async () => {
    setMsg('');
    if (!pwd.new_password || pwd.new_password !== pwd.confirm) { setMsg('Passwords do not match'); return; }
    try {
      const r = await fetch(`${API_BASE}/api/user/profile`, {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({ current_password: pwd.current_password, new_password: pwd.new_password })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Password change failed');
      setMsg('Password changed');
      setPwd({ current_password: '', new_password: '', confirm: '' });
    } catch (e) { setMsg(e.message); }
  };

  const logout = () => { localStorage.removeItem('userToken'); nav('/'); };

  return (
    <div className="min-h-screen bg-neutral-950 text-white pt-16">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="text-3xl font-bold">Account</h1>
        <p className="mt-1 text-neutral-300">Manage your profile and security settings.</p>

        {msg && <div className="mt-4 rounded border border-white/10 bg-neutral-900/60 px-3 py-2 text-sm">{msg}</div>}

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
            <h2 className="text-lg font-semibold">Profile</h2>
            <label className="mt-3 block text-sm text-neutral-300">Username (read-only)</label>
            <input className="mt-1 w-full rounded bg-neutral-800 border border-white/10 p-2" value={me.username} readOnly />
            <label className="mt-3 block text-sm text-neutral-300">Email</label>
            <input className="mt-1 w-full rounded bg-neutral-800 border border-white/10 p-2" value={me.email} onChange={e=>setMe({...me, email:e.target.value})}/>
            <label className="mt-3 block text-sm text-neutral-300">Default shipping address</label>
            <textarea className="mt-1 w-full rounded bg-neutral-800 border border-white/10 p-2" rows={4} value={me.address} onChange={e=>setMe({...me, address:e.target.value})}/>
            <button className="mt-4 rounded bg-white text-neutral-900 font-semibold px-4 py-2 hover:bg-neutral-200" onClick={saveProfile}>Save changes</button>
          </div>

          <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4">
            <h2 className="text-lg font-semibold">Security</h2>
            <label className="mt-3 block text-sm text-neutral-300">Current password</label>
            <input type="password" className="mt-1 w-full rounded bg-neutral-800 border border-white/10 p-2" value={pwd.current_password} onChange={e=>setPwd({...pwd, current_password:e.target.value})}/>
            <label className="mt-3 block text-sm text-neutral-300">New password</label>
            <input type="password" className="mt-1 w-full rounded bg-neutral-800 border border-white/10 p-2" value={pwd.new_password} onChange={e=>setPwd({...pwd, new_password:e.target.value})}/>
            <label className="mt-3 block text-sm text-neutral-300">Confirm new password</label>
            <input type="password" className="mt-1 w-full rounded bg-neutral-800 border border-white/10 p-2" value={pwd.confirm} onChange={e=>setPwd({...pwd, confirm:e.target.value})}/>
            <button className="mt-4 rounded bg-white text-neutral-900 font-semibold px-4 py-2 hover:bg-neutral-200" onClick={changePassword}>Change password</button>

            <hr className="my-6 border-white/10"/>
            <button className="rounded bg-neutral-800 hover:bg-neutral-700 px-4 py-2" onClick={logout}>Logout</button>
          </div>
        </div>
      </div>
    </div>
  );
}
