import { useState } from "react";

export default function Contact() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [msg, setMsg] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("http://127.0.0.1:5000/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg("✅ Message sent! We'll get back to you soon.");
        setForm({ name: "", email: "", message: "" });
      } else {
        setMsg("❌ " + (data.error || "Failed to send message"));
      }
    } catch (err) {
      setMsg("❌ Network error");
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_10%,rgba(34,197,94,0.08),transparent_60%)]" />

      <div className="max-w-6xl mx-auto px-6 pt-28 pb-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-transparent bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text">
            Contact Us
          </h1>
          <p className="mt-3 text-neutral-400 text-sm md:text-base max-w-2xl mx-auto">
            Have a question or want to work with us? Fill out the form below or
            reach us via email and we’ll respond as soon as possible.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="max-w-lg mx-auto rounded-2xl bg-neutral-900/60 border border-white/10 p-6 shadow-xl backdrop-blur"
        >
          <label className="block text-sm mb-2">Name</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            className="w-full p-3 mb-4 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            placeholder="Your name"
            required
          />

          <label className="block text-sm mb-2">Email</label>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            className="w-full p-3 mb-4 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            placeholder="you@example.com"
            required
          />

          <label className="block text-sm mb-2">Message</label>
          <textarea
            name="message"
            value={form.message}
            onChange={handleChange}
            rows="4"
            className="w-full p-3 mb-5 rounded-lg bg-neutral-800 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            placeholder="Write your message here..."
            required
          />

          <button
            type="submit"
            className="w-full p-3 rounded-full bg-cyan-600 hover:bg-cyan-500 font-semibold transition"
          >
            Send Message
          </button>

          {msg && <p className="mt-3 text-sm text-neutral-200">{msg}</p>}
        </form>
      </div>
    </div>
  );
}
