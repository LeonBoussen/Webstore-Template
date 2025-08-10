import { useEffect, useState } from 'react';
import axios from 'axios';

const Home = () => {
  const [upPhrase, setUpPhrase] = useState('');
  const [downPhrase, setDownPhrase] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const fetchCatchphrase = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/catchphrase');
        setUpPhrase(response.data.upphrase);
        setDownPhrase(response.data.downphrase);
        setLoaded(true);
      } catch (error) {
        console.error('Error fetching catchphrase:', error);
      }
    };
    fetchCatchphrase();
  }, []);

  return (
    <>
      <style>
        {`
          @keyframes gradientPulse {
            0% { background-position: 0% 50%; }
            25% { background-position: 100% 0%; }
            50% { background-position: 100% 100%; }
            75% { background-position: 0% 100%; }
            100% { background-position: 0% 50%; }
          }
          .animate-gradient-pulse {
            background-size: 400% 400%;
            animation: gradientPulse 10s ease-in-out infinite;
          }
        `}
      </style>

      <div className="relative h-screen w-full flex items-center justify-center bg-cover bg-center"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1729575846511-f499d2e17d79?q=80&w=1632&auto=format&fit=crop')`
        }}
      >
        {/* Dark overlay for better readability */}
        <div className="absolute inset-0 bg-black/60"></div>

        {/* Content */}
        <div className={`relative z-10 text-center px-6 transition-opacity duration-1000 ease-in-out ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}>
          <div className="text-4xl md:text-6xl font-bold text-transparent bg-gradient-to-r from-green-400 via-emerald-300 to-cyan-400 bg-clip-text animate-gradient-pulse drop-shadow-lg mb-6">
            <p>{upPhrase}</p>
            <p>{downPhrase}</p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-wrap gap-4 justify-center mt-6">
            <a
              href="/products"
              className="px-6 py-3 rounded-full bg-cyan-500 text-white font-semibold shadow-lg hover:shadow-cyan-500/50 hover:bg-cyan-400 transition-all"
            >
              Explore Products
            </a>
            <a
              href="/about"
              className="px-6 py-3 rounded-full border border-white text-white font-semibold hover:bg-white hover:text-black transition-all"
            >
              Learn More
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

export default Home;
