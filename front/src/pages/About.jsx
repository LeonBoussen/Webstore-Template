export default function About() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(60%_40%_at_50%_10%,rgba(34,197,94,0.08),transparent_60%)]" />

      <div className="max-w-6xl mx-auto px-6 pt-28 pb-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-transparent bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text">
            About Us
          </h1>
          <p className="mt-3 text-neutral-400 text-sm md:text-base max-w-2xl mx-auto">
            We are passionate developers, designers, and security enthusiasts
            who create technology with intent. Our mission is to deliver products
            and services that combine usability, privacy, and strong security.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-start">
          <div>
            <h2 className="text-xl font-semibold mb-4">Our Mission</h2>
            <p className="text-neutral-300">
              We aim to make technology <span className="text-white">work beautifully</span> 
              while protecting user data and ensuring trust. Whether it’s websites, 
              software, or consulting, our focus remains on quality and transparency.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-4">Our Values</h2>
            <ul className="space-y-3 text-neutral-300">
              {[
                "Privacy-first approach",
                "Performance and reliability",
                "Security best practices",
                "Clear communication & fair pricing"
              ].map((v, i) => (
                <li key={i} className="flex items-start gap-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" className="mt-1">
                    <path
                      fill="currentColor"
                      d="M9 16.2l-3.5-3.6L4 14l5 5 11-11-1.5-1.4z"
                    />
                  </svg>
                  {v}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
