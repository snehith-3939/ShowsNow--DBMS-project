import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const MovieDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useContext(AppContext);
  const [movie, setMovie] = useState(null);
  const [trailerKey, setTrailerKey] = useState(null);
  const [showRating, setShowRating] = useState(false);
  const [hoverStar, setHoverStar] = useState(0);
  const [selectedStar, setSelectedStar] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingDone, setRatingDone] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/movies/${id}`)
      .then(res => res.json())
      .then(setMovie);
  }, [id]);

  if (!movie) return <div style={{ padding: '4rem', color: 'white', background: '#1A1A1A', minHeight: '100vh' }}>Loading...</div>;

  const rating = parseFloat(movie.vote_average || 0).toFixed(1);
  const voteCount = movie.vote_count > 1000 ? `${(movie.vote_count / 1000).toFixed(0)}K` : movie.vote_count || '?';

  const handleSubmitRating = async () => {
    if (!selectedStar) return;
    setRatingSubmitting(true);
    try {
      const res = await fetch(`${API}/api/movies/${id}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ rating: selectedStar })
      });
      const data = await res.json();
      if (res.ok) {
        setMovie(prev => ({ ...prev, vote_average: data.vote_average, vote_count: data.vote_count }));
        setRatingDone(true);
        setTimeout(() => { setShowRating(false); setRatingDone(false); setSelectedStar(0); }, 1500);
      }
    } catch {/* silent */} finally {
      setRatingSubmitting(false);
    }
  };

  return (
    <div style={{ background: '#1A1A1A', minHeight: '100vh', color: 'white' }}>

      {/* Trailer Modal */}
      {trailerKey && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '80%', maxWidth: '1000px', aspectRatio: '16/9' }}>
            <span onClick={() => setTrailerKey(null)} style={{ position: 'absolute', top: '-40px', right: 0, color: 'white', fontSize: '2rem', cursor: 'pointer', fontWeight: 'bold' }}>✕</span>
            <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`} title="Trailer" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} />
          </div>
        </div>
      )}

      {/* Rate Now Modal */}
      {showRating && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1e1f26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '2.5rem', width: '360px', textAlign: 'center', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
            <span onClick={() => setShowRating(false)} style={{ position: 'absolute', top: '1rem', right: '1.5rem', cursor: 'pointer', fontSize: '1.2rem', color: '#aaa' }}>✕</span>
            {ratingDone ? (
              <>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
                <h3 style={{ color: '#4ade80', marginBottom: '0.5rem' }}>Thanks for rating!</h3>
                <p style={{ color: 'var(--bms-muted)' }}>Your rating has been submitted.</p>
              </>
            ) : (
              <>
                <h3 style={{ color: 'white', marginBottom: '0.3rem', fontSize: '1.2rem' }}>Rate this Movie</h3>
                <p style={{ color: 'var(--bms-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>{movie.title}</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '1.2rem' }}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <span
                      key={n}
                      onMouseEnter={() => setHoverStar(n)}
                      onMouseLeave={() => setHoverStar(0)}
                      onClick={() => setSelectedStar(n)}
                      style={{
                        fontSize: '1.6rem', cursor: 'pointer',
                        color: n <= (hoverStar || selectedStar) ? '#f59e0b' : '#4b5563',
                        transition: 'color 0.1s, transform 0.1s',
                        transform: n <= (hoverStar || selectedStar) ? 'scale(1.2)' : 'scale(1)',
                        display: 'inline-block'
                      }}
                    >★</span>
                  ))}
                </div>
                {selectedStar > 0 && (
                  <p style={{ color: '#f59e0b', fontWeight: '700', fontSize: '1.1rem', marginBottom: '1rem' }}>
                    {selectedStar}/10
                  </p>
                )}
                {!user && <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.8rem' }}>Please sign in to submit a rating.</p>}
                <button
                  onClick={handleSubmitRating}
                  disabled={!selectedStar || ratingSubmitting || !user}
                  style={{
                    background: selectedStar && user ? 'linear-gradient(135deg, #d4af37, #8b6f3d)' : 'rgba(255,255,255,0.1)',
                    color: 'white', border: 'none', borderRadius: '10px',
                    padding: '12px 32px', fontWeight: '700', cursor: selectedStar && user ? 'pointer' : 'not-allowed',
                    fontSize: '0.95rem', width: '100%', transition: 'all 0.2s'
                  }}
                >
                  {ratingSubmitting ? 'Submitting...' : 'Submit Rating'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Hero Banner */}
      <div style={{
        backgroundImage: `linear-gradient(90deg, #1A1A1A 30%, rgba(26,26,26,0.6) 60%, rgba(26,26,26,0.1) 100%), url(${movie.banner_url})`,
        backgroundSize: 'cover', backgroundPosition: 'center top',
        padding: '3rem 4rem', display: 'flex', gap: '2.5rem', minHeight: '380px', alignItems: 'center'
      }}>
        <img src={movie.poster_url} alt={movie.title} style={{ width: '240px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', flexShrink: 0 }} />
        <div>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '0.75rem', lineHeight: 1.2 }}>{movie.title}</h1>

          {/* Rating Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ background: '#1ea83c', padding: '6px 14px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: '700' }}>
              ⭐ {rating}/10 <span style={{ fontWeight: 400, opacity: 0.8 }}>({voteCount} Votes)</span>
            </div>
            <button
              onClick={() => setShowRating(true)}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              ★ Rate Now
            </button>
          </div>

          {/* Format / Language Tags */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {['2D', 'IMAX 2D', '4DX'].map(f => (
              <span key={f} style={{ background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '600', border: '1px solid rgba(255,255,255,0.25)' }}>{f}</span>
            ))}
          </div>

          <div style={{ color: '#bbb', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {movie.duration_mins} min • {movie.genre} • UA • {movie.language}
          </div>

          {movie.overview && (
            <p style={{ color: '#ccc', fontSize: '0.95rem', lineHeight: 1.7, maxWidth: '600px', marginBottom: '2rem' }}>
              {movie.overview}
            </p>
          )}

          <div style={{ display: 'flex', gap: '1rem' }}>
            {movie.release_date && new Date(movie.release_date) > new Date() ? (
              <button disabled style={{ background: 'rgba(255,255,255,0.1)', color: '#888', border: 'none', padding: '14px 3rem', borderRadius: '8px', fontSize: '1.1rem', fontWeight: '700', cursor: 'not-allowed' }}>
                Releases on {new Date(movie.release_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </button>
            ) : (
              <button
                onClick={() => navigate(`/buytickets/${movie.movie_id}`)}
                style={{ background: 'var(--bms-red)', color: 'white', border: 'none', padding: '14px 3rem', borderRadius: '8px', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 15px rgba(248,68,100,0.4)', transition: 'transform 0.2s' }}
                onMouseEnter={e => e.target.style.transform = 'scale(1.03)'}
                onMouseLeave={e => e.target.style.transform = 'scale(1)'}
              >
                Book Tickets
              </button>
            )}
            {movie.trailer_key && (
              <button
                onClick={() => setTrailerKey(movie.trailer_key)}
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '14px 2rem', borderRadius: '8px', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s' }}
                onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.2)'}
                onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.1)'}
              >
                <span>▶</span> Watch Trailer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* About Section */}
      <div style={{ background: 'white', color: '#333', padding: '3rem 4rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.4rem' }}>About the Movie</h2>
        <p style={{ color: '#555', lineHeight: 1.8, maxWidth: '800px' }}>
          {movie.overview || 'An epic cinematic experience awaits.'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2rem', marginTop: '2.5rem', padding: '1.5rem 0', borderTop: '1px solid #eee' }}>
          {[
            ['Language', movie.language],
            ['Genre', movie.genre],
            ['Duration', `${movie.duration_mins} min`],
            ['Rating', 'UA'],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ color: '#999', fontSize: '0.8rem', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{val || '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MovieDetails;
