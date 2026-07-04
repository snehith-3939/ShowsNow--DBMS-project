import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const MovieDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [trailerKey, setTrailerKey] = useState(null);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/movies/${id}`)
      .then(res => res.json())
      .then(setMovie);
  }, [id]);

  if (!movie) return <div style={{ padding: '4rem', color: 'white', background: '#1A1A1A', minHeight: '100vh' }}>Loading...</div>;

  const rating = parseFloat(movie.vote_average || 0).toFixed(1);
  const voteCount = movie.vote_count > 1000 ? `${(movie.vote_count / 1000).toFixed(0)}K` : movie.vote_count || '?';

  return (
    <div style={{ background: '#1A1A1A', minHeight: '100vh', color: 'white' }}>
      {/* Trailer Modal */}
      {trailerKey && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '80%', maxWidth: '1000px', aspectRatio: '16/9' }}>
            <span 
              onClick={() => setTrailerKey(null)}
              style={{ position: 'absolute', top: '-40px', right: 0, color: 'white', fontSize: '2rem', cursor: 'pointer', fontWeight: 'bold' }}
            >✕</span>
            <iframe
              width="100%" height="100%"
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
              title="YouTube video player" frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}
            ></iframe>
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
            <button style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '6px 14px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem' }}>
              Rate Now
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
            <button
              onClick={() => navigate(`/buytickets/${movie.movie_id}`)}
              style={{
                background: 'var(--bms-red)', color: 'white', border: 'none',
                padding: '14px 3rem', borderRadius: '8px', fontSize: '1.1rem',
                fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 15px rgba(248,68,100,0.4)',
                transition: 'transform 0.2s'
              }}
              onMouseEnter={e => e.target.style.transform = 'scale(1.03)'}
              onMouseLeave={e => e.target.style.transform = 'scale(1)'}
            >
              Book Tickets
            </button>
            {movie.trailer_key && (
              <button
                onClick={() => setTrailerKey(movie.trailer_key)}
                style={{
                  background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.3)',
                  padding: '14px 2rem', borderRadius: '8px', fontSize: '1.1rem',
                  fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                  transition: 'background 0.2s'
                }}
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
          {movie.overview || 'An epic cinematic experience awaits. This film promises breathtaking visuals, compelling performances, and a story that will leave you on the edge of your seat.'}
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
