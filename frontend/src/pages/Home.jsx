import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';

const Home = () => {
  const [movies, setMovies] = useState([]);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [wishlist, setWishlist] = useState({});
  const [trailerKey, setTrailerKey] = useState(null); // For trailer modal
  const navigate = useNavigate();
  const { selectedCity, searchQuery } = useContext(AppContext);
  const intervalRef = useRef(null);

  useEffect(() => {
    fetch(`http://localhost:5000/api/movies?city=${encodeURIComponent(selectedCity)}`)
      .then(res => res.json())
      .then(setMovies);
  }, [selectedCity]);

  // Auto-rotate carousel
  useEffect(() => {
    if (movies.length === 0 || trailerKey) return; // Pause carousel if trailer is playing
    intervalRef.current = setInterval(() => {
      setCarouselIdx(i => (i + 1) % Math.min(movies.length, 5));
    }, 4000);
    return () => clearInterval(intervalRef.current);
  }, [movies, trailerKey]);

  const goToSlide = (i) => {
    setCarouselIdx(i);
    clearInterval(intervalRef.current);
    if (!trailerKey) {
      intervalRef.current = setInterval(() => {
        setCarouselIdx(prev => (prev + 1) % Math.min(movies.length, 5));
      }, 4000);
    }
  };

  const filteredMovies = movies.filter(m =>
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.genre || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const carouselMovies = movies.slice(0, 5);

  const toggleWishlist = (e, movieId) => {
    e.stopPropagation();
    setWishlist(prev => ({ ...prev, [movieId]: !prev[movieId] }));
  };

  const renderStars = (avg) => {
    const score = parseFloat(avg || 0);
    const out5 = score / 2;
    return '★'.repeat(Math.round(out5)) + '☆'.repeat(5 - Math.round(out5));
  };

  return (
    <>
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

      {/* Auto-Rotating Hero Carousel */}
      <div style={{ position: 'relative', height: '360px', overflow: 'hidden', background: '#1a1a2e' }}>
        {carouselMovies.map((movie, i) => (
          <div
            key={movie.movie_id}
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${movie.banner_url})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              opacity: i === carouselIdx ? 1 : 0,
              transition: 'opacity 0.8s ease-in-out',
              cursor: 'pointer',
              pointerEvents: i === carouselIdx ? 'auto' : 'none'
            }}
            onClick={() => navigate(`/movie/${movie.movie_id}`)}
          >
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.7) 0%, transparent 60%, rgba(0,0,0,0.2) 100%)' }} />
            <div style={{ position: 'absolute', bottom: '3rem', left: '4rem', color: 'white' }}>
              <h2 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '0.5rem', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{movie.title}</h2>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '1rem', marginBottom: '1.2rem', fontWeight: '500' }}>{movie.genre} • {movie.duration_mins} min • {movie.language}</div>
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={e => { e.stopPropagation(); navigate(`/buytickets/${movie.movie_id}`); }}
                  style={{ background: 'var(--bms-red)', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 12px rgba(248,68,100,0.4)' }}
                >
                  Book Now
                </button>
                {movie.trailer_key && (
                  <button
                    onClick={e => { e.stopPropagation(); setTrailerKey(movie.trailer_key); }}
                    style={{ background: 'rgba(0,0,0,0.6)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', padding: '12px 24px', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', backdropFilter: 'blur(4px)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.6)'}
                  >
                    <span>▶</span> Play Trailer
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Dots */}
        <div style={{ position: 'absolute', bottom: '1rem', right: '4rem', display: 'flex', gap: '6px', zIndex: 10 }}>
          {carouselMovies.map((_, i) => (
            <div
              key={i}
              onClick={(e) => { e.stopPropagation(); goToSlide(i); }}
              style={{
                width: i === carouselIdx ? '24px' : '8px', height: '8px', borderRadius: '4px',
                background: i === carouselIdx ? 'var(--bms-red)' : 'rgba(255,255,255,0.5)',
                cursor: 'pointer', transition: 'all 0.3s'
              }}
            />
          ))}
        </div>
      </div>

      {/* Movie Grid */}
      <div className="main-container">
        <h2 className="section-title">
          Recommended Movies in {selectedCity === 'All' ? 'India' : selectedCity}
          {searchQuery && <span style={{ fontSize: '1rem', color: '#999', fontWeight: 400, marginLeft: '0.5rem' }}>— results for "{searchQuery}"</span>}
        </h2>
        <div className="movie-grid">
          {filteredMovies.map(movie => (
            <div key={movie.movie_id} className="movie-card" onClick={() => navigate(`/movie/${movie.movie_id}`)}>
              <div style={{ position: 'relative' }}>
                <img
                  src={movie.poster_url || 'https://via.placeholder.com/220x330?text=No+Poster'}
                  alt={movie.title} className="poster"
                />
                {/* Wishlist heart */}
                <button
                  onClick={e => toggleWishlist(e, movie.movie_id)}
                  style={{
                    position: 'absolute', top: '10px', right: '10px',
                    background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
                    width: '34px', height: '34px', cursor: 'pointer', fontSize: '1rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: wishlist[movie.movie_id] ? 'var(--bms-red)' : 'white',
                    transition: 'all 0.2s'
                  }}
                  title={wishlist[movie.movie_id] ? 'Remove from Wishlist' : 'Add to Wishlist'}
                >
                  {wishlist[movie.movie_id] ? '❤️' : '🤍'}
                </button>
                {/* Certification badge */}
                <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 7px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 'bold' }}>UA</div>
              </div>
              <div style={{ paddingTop: '0.5rem' }}>
                {/* Star rating */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ color: '#f5a623', fontSize: '0.75rem' }}>{renderStars(movie.vote_average)}</span>
                  <span style={{ color: '#999', fontSize: '0.75rem' }}>{parseFloat(movie.vote_average || 0).toFixed(1)}/10</span>
                </div>
                <div className="movie-title">{movie.title}</div>
                <div className="movie-genre">{movie.genre}</div>
              </div>
            </div>
          ))}
          {filteredMovies.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: '#666' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎬</div>
              <h3>No movies found</h3>
              <p>Try a different search term or city.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Home;
