import { useState, useEffect } from 'react';
import { apiUrl } from '../api';

const Stream = () => {
  const [shows, setShows] = useState([]);

  useEffect(() => {
    fetch(apiUrl('/api/stream'))
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setShows(data);
      })
      .catch(err => console.error(err));
  }, []);

  const renderStars = (avg) => {
    const score = parseFloat(avg || 0);
    const out5 = score / 2;
    return '★'.repeat(Math.round(out5)) + '☆'.repeat(5 - Math.round(out5));
  };

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', paddingBottom: '4rem' }}>
      {/* Stream Hero Banner */}
      <div style={{ background: '#1a1a2e', color: 'white', padding: '3rem 4rem', display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ background: 'var(--bms-red)', display: 'inline-block', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '1rem' }}>PREMIERE</div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Stream Trending TV Shows</h1>
          <p style={{ color: '#aaa', fontSize: '1.1rem', maxWidth: '600px', lineHeight: 1.6 }}>
            Brand new releases every Friday. Watch the most popular and critically acclaimed television series from around the world, directly on ShowsNow Stream.
          </p>
        </div>
        <img 
          src="https://images.unsplash.com/photo-1593784991095-a205069470b6?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80" 
          alt="Stream Banner" 
          style={{ width: '400px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
        />
      </div>

      {/* Shows Grid */}
      <div className="main-container">
        <h2 className="section-title">Trending This Week</h2>
        <div className="movie-grid">
          {shows.map(show => (
            <div key={show.id} className="movie-card" style={{ cursor: 'default' }}>
              <div style={{ position: 'relative' }}>
                <img
                  src={show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : 'https://via.placeholder.com/220x330?text=No+Poster'}
                  alt={show.name} 
                  className="poster"
                />
                <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.7)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                  {show.original_language?.toUpperCase() || 'EN'}
                </div>
              </div>
              <div style={{ paddingTop: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ color: '#f5a623', fontSize: '0.75rem' }}>{renderStars(show.vote_average)}</span>
                  <span style={{ color: '#999', fontSize: '0.75rem' }}>{parseFloat(show.vote_average || 0).toFixed(1)}/10</span>
                </div>
                <div className="movie-title">{show.name}</div>
                <div className="movie-genre">First Aired: {show.first_air_date}</div>
              </div>
              <button 
                style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--bms-red)', color: 'var(--bms-red)', borderRadius: '6px', marginTop: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                onClick={() => alert('Streaming playback is premium feature!')}
              >
                Watch Trailer
              </button>
            </div>
          ))}
          {shows.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: '#666' }}>
              <h3>Loading Stream Catalog...</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Stream;
