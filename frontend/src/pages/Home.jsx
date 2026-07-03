import { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';

const GENRES = ['All', 'Action', 'Animation', 'Drama', 'Horror', 'Science Fiction', 'Musical', 'Thriller'];

const Home = () => {
  const [movies, setMovies] = useState([]);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [activeGenre, setActiveGenre] = useState('All');
  const [trailerKey, setTrailerKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { selectedCity, searchQuery } = useContext(AppContext);
  const intervalRef = useRef(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`http://localhost:5000/api/movies?city=${encodeURIComponent(selectedCity)}`)
      .then(res => res.json())
      .then(data => { setMovies(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedCity]);

  useEffect(() => {
    if (movies.length === 0 || trailerKey) return;
    intervalRef.current = setInterval(() => {
      setCarouselIdx(i => (i + 1) % Math.min(movies.length, 6));
    }, 4500);
    return () => clearInterval(intervalRef.current);
  }, [movies, trailerKey]);

  const goToSlide = (i) => {
    setCarouselIdx(i);
    clearInterval(intervalRef.current);
    if (!trailerKey) {
      intervalRef.current = setInterval(() => {
        setCarouselIdx(prev => (prev + 1) % Math.min(movies.length, 6));
      }, 4500);
    }
  };

  const filteredMovies = movies.filter(m => {
    const matchSearch = m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.genre || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchGenre = activeGenre === 'All' || (m.genre || '').includes(activeGenre);
    return matchSearch && matchGenre;
  });

  const nowShowing = filteredMovies.filter(m => !m.release_date || new Date(m.release_date) <= new Date());
  const comingSoon = filteredMovies.filter(m => m.release_date && new Date(m.release_date) > new Date());

  const carouselMovies = nowShowing.slice(0, 6);

  const renderStars = (avg) => {
    const score = parseFloat(avg || 0);
    const out5 = score / 2;
    return '★'.repeat(Math.round(out5)) + '☆'.repeat(5 - Math.round(out5));
  };

  const getFormatBadge = (title, duration) => {
    if (title.toLowerCase().includes('dune') || duration > 160) return 'IMAX';
    if (title.toLowerCase().includes('godzilla') || title.toLowerCase().includes('gladiator')) return '4DX';
    return '2D';
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ width: '48px', height: '48px', border: '4px solid #f0f0f0', borderTop: '4px solid #f84464', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <p style={{ color: '#999' }}>Loading movies...</p>
    </div>
  );

  return (
    <>
      {/* Trailer Modal */}
      {trailerKey && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: '85%', maxWidth: '1100px', aspectRatio: '16/9' }}>
            <span onClick={() => setTrailerKey(null)} style={{ position: 'absolute', top: '-48px', right: 0, color: 'white', fontSize: '2.2rem', cursor: 'pointer', fontWeight: 'bold', opacity: 0.8 }}>✕</span>
            <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
              title="Trailer" frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen style={{ borderRadius: '12px' }}
            ></iframe>
          </div>
        </div>
      )}

      {/* ── Hero Carousel ── */}
      <div style={{ position: 'relative', height: '420px', overflow: 'hidden', background: '#0a0a1a' }}>
        {carouselMovies.map((movie, i) => (
          <div key={movie.movie_id} style={{
            position: 'absolute', inset: 0,
            backgroundImage: movie.banner_url ? `url(${movie.banner_url})` : 'linear-gradient(135deg, #1a1a3e, #0d0d1f)',
            backgroundSize: 'cover', backgroundPosition: 'center top',
            opacity: i === carouselIdx ? 1 : 0,
            transition: 'opacity 0.9s ease-in-out',
            pointerEvents: i === carouselIdx ? 'auto' : 'none'
          }}>
            {/* Gradient overlay */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,0.15) 100%)' }} />
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '120px', background: 'linear-gradient(to top, rgba(10,10,26,0.9), transparent)' }} />

            <div style={{ position: 'absolute', bottom: '2.5rem', left: '4rem', color: 'white', maxWidth: '520px' }}>
              {/* Genre pill */}
              <div style={{ display: 'inline-block', background: 'rgba(248,68,100,0.85)', color: 'white', padding: '3px 12px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
                {movie.genre}
              </div>
              <h2 style={{ fontSize: '2.6rem', fontWeight: '900', marginBottom: '0.4rem', textShadow: '0 2px 8px rgba(0,0,0,0.6)', lineHeight: 1.1 }}>{movie.title}</h2>
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                ⏱ {movie.duration_mins} min &nbsp;•&nbsp; 🌐 {movie.language} &nbsp;•&nbsp; ⭐ {parseFloat(movie.vote_average || 0).toFixed(1)}/10
              </div>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.85rem', marginBottom: '1.2rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {movie.overview}
              </p>
              <div style={{ display: 'flex', gap: '0.8rem' }}>
                <button onClick={() => navigate(`/buytickets/${movie.movie_id}`)}
                  style={{ background: 'var(--bms-red)', color: 'white', border: 'none', padding: '11px 28px', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 16px rgba(248,68,100,0.5)', transition: 'all 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  🎟 Book Tickets
                </button>
                {movie.trailer_key && (
                  <button onClick={() => setTrailerKey(movie.trailer_key)}
                    style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '11px 24px', borderRadius: '8px', fontSize: '0.95rem', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                  >
                    ▶ Trailer
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Slide dots */}
        <div style={{ position: 'absolute', bottom: '1.2rem', right: '3rem', display: 'flex', gap: '6px', zIndex: 10 }}>
          {carouselMovies.map((_, i) => (
            <div key={i} onClick={() => goToSlide(i)}
              style={{ width: i === carouselIdx ? '28px' : '8px', height: '8px', borderRadius: '4px', background: i === carouselIdx ? 'var(--bms-red)' : 'rgba(255,255,255,0.4)', cursor: 'pointer', transition: 'all 0.3s ease' }}
            />
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="main-container" style={{ paddingTop: '2rem' }}>
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
          <h2 className="section-title" style={{ margin: 0 }}>
            Now Showing in {selectedCity === 'All' ? 'India' : selectedCity}
            <span style={{ fontSize: '0.85rem', color: '#999', fontWeight: 400, marginLeft: '0.6rem' }}>({nowShowing.length} movies)</span>
          </h2>
        </div>

        {/* Genre Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.8rem' }}>
          {GENRES.map(g => (
            <button key={g} onClick={() => setActiveGenre(g)}
              style={{
                padding: '6px 18px', borderRadius: '20px', border: activeGenre === g ? 'none' : '1.5px solid #ddd',
                background: activeGenre === g ? 'var(--bms-red)' : 'white',
                color: activeGenre === g ? 'white' : '#555',
                fontWeight: activeGenre === g ? '700' : '400',
                cursor: 'pointer', fontSize: '0.82rem', transition: 'all 0.2s',
                boxShadow: activeGenre === g ? '0 3px 10px rgba(248,68,100,0.3)' : 'none'
              }}>
              {g}
            </button>
          ))}
        </div>

        {/* Movie Grid */}
        <div className="movie-grid">
          {nowShowing.map(movie => (
            <div key={movie.movie_id} className="movie-card" onClick={() => navigate(`/movie/${movie.movie_id}`)}
              style={{ cursor: 'pointer', borderRadius: '12px', overflow: 'hidden', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
            >
              <div style={{ position: 'relative', overflow: 'hidden' }}>
                <img
                  src={movie.poster_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(movie.title)}&size=300&background=333545&color=fff&bold=true`}
                  alt={movie.title}
                  className="poster"
                  style={{ display: 'block', width: '100%', aspectRatio: '2/3', objectFit: 'cover' }}
                  onError={e => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(movie.title)}&size=300&background=333545&color=fff&bold=true`; }}
                />
                {/* Format badge */}
                <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '800', letterSpacing: '0.5px' }}>
                  {getFormatBadge(movie.title, movie.duration_mins)}
                </div>
                {/* Rating badge */}
                <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', color: '#f5c518', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '800' }}>
                  ⭐ {parseFloat(movie.vote_average || 0).toFixed(1)}
                </div>
                {/* Book Now overlay on hover */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(248,68,100,0.95), transparent)', padding: '2rem 1rem 1rem', transform: 'translateY(100%)', transition: 'transform 0.25s ease', pointerEvents: 'none' }}
                  className="book-overlay">
                  <div style={{ color: 'white', fontWeight: 'bold', textAlign: 'center', marginBottom: '0.5rem' }}>Book Tickets</div>
                  <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', textAlign: 'center' }}>{movie.language} • {movie.genre.split(',')[0]}</div>
                </div>
                {/* Quick Book button */}
                <button
                  onClick={e => { e.stopPropagation(); navigate(`/buytickets/${movie.movie_id}`); }}
                  style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%) translateY(50px)', background: 'var(--bms-red)', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '20px', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer', opacity: 0, transition: 'all 0.25s ease', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
                  className="quick-book-btn"
                >
                  Book Now
                </button>
              </div>
              <div style={{ padding: '0.7rem 0.5rem 0.8rem' }}>
                <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#1a1a2e', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</div>
                <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '5px' }}>{movie.genre}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: '#f5a623', fontSize: '0.7rem' }}>{renderStars(movie.vote_average)}</span>
                  <span style={{ color: '#bbb', fontSize: '0.7rem' }}>({parseFloat(movie.vote_average || 0).toFixed(1)})</span>
                </div>
              </div>
            </div>
          ))}
          {nowShowing.length === 0 && !loading && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '5rem', color: '#999' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎬</div>
              <h3 style={{ fontWeight: '600', color: '#555' }}>No movies found</h3>
              <p style={{ color: '#aaa' }}>Try changing the city or selecting a different genre.</p>
            </div>
          )}
        </div>

        {/* Coming Soon Section */}
        {comingSoon.length > 0 && (
          <div style={{ marginTop: '4rem' }}>
            <h2 className="section-title" style={{ marginBottom: '1.2rem' }}>
              Coming Soon
              <span style={{ fontSize: '0.85rem', color: '#999', fontWeight: 400, marginLeft: '0.6rem' }}>({comingSoon.length} movies)</span>
            </h2>
            <div className="movie-grid">
              {comingSoon.map(movie => (
                <div key={movie.movie_id} className="movie-card"
                  style={{ borderRadius: '12px', overflow: 'hidden', transition: 'transform 0.2s, box-shadow 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(0,0,0,0.15)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
                >
                  <div style={{ position: 'relative', overflow: 'hidden' }}>
                    <img
                      src={movie.poster_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(movie.title)}&size=300&background=333545&color=fff&bold=true`}
                      alt={movie.title}
                      className="poster"
                      style={{ display: 'block', width: '100%', aspectRatio: '2/3', objectFit: 'cover' }}
                      onError={e => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(movie.title)}&size=300&background=333545&color=fff&bold=true`; }}
                    />
                    {/* Release Date Banner */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', padding: '0.8rem', textAlign: 'center' }}>
                      <div style={{ color: '#f5c518', fontWeight: 'bold', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Releases {new Date(movie.release_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '0.7rem 0.5rem 0.8rem' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.9rem', color: '#1a1a2e', marginBottom: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</div>
                    <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '5px' }}>{movie.genre}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hover CSS injection */}
      <style>{`
        .movie-card:hover .quick-book-btn {
          opacity: 1 !important;
          transform: translateX(-50%) translateY(0) !important;
        }
        .movie-card:hover .book-overlay {
          transform: translateY(0) !important;
        }
      `}</style>
    </>
  );
};

export default Home;
