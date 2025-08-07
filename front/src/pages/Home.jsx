import { useEffect, useState } from 'react';
import axios from 'axios';

const Home = () => {
  const [upPhrase, setUpPhrase] = useState('');
  const [downPhrase, setDownPhrase] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    console.log("🔄 useEffect fired");

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
      {/* Noticeably strong animation keyframes */}
      <style>
        {`
          @keyframes gradientPulse {
            0% {
              background-position: 0% 50%;
            }
            25% {
              background-position: 100% 0%;
            }
            50% {
              background-position: 100% 100%;
            }
            75% {
              background-position: 0% 100%;
            }
            100% {
              background-position: 0% 50%;
            }
          }

          .animate-gradient-pulse {
            background-size: 400% 400%;
            animation: gradientPulse 10s ease-in-out infinite;
          }
        `}
      </style>

      <div
        className="relative h-screen flex items-center justify-center bg-[url('https://images.unsplash.com/photo-1729575846511-f499d2e17d79?q=80&w=1632&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')] bg-neutral-950/20 bg-blend-color bg-cover bg-center text-white"
      >
        <div
          className={`text-center text-5xl font-bold text-transparent bg-gradient-to-r from-green-700 via-emerald-900 to-blue-600 bg-clip-text drop-shadow-lg transition-opacity ease-in-out animate-gradient-pulse ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            transitionDuration: '1s',
            paddingBottom: '0.25em',
            paddingTop: '0.25em'
          }}
        >
          <p>{upPhrase}</p>
          <p>{downPhrase}</p>
        </div>
      </div>
    </>
  );
};

export default Home;
