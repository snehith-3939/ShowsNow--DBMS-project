import { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { AppContext } from '../context/AppContext';

const ShowTimings = () => {
  const { selectedCity } = useContext(AppContext);
  const { id } = useParams();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(null);
  const [shows, setShows] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [formatFilter, setFormatFilter] = useState('All');
  const [langFilter, setLangFilter] = useState('All');

  // Build 7-day date array
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  const toDateStr = (d) => d.toISOString().split('T')[0];
  const activeDate = selectedDate || dates[0];

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/movies/${id}`)
      .then(res => res.json())
      .then(setMovie);
  }, [id]);

  useEffect(() => {
    const dateStr = toDateStr(activeDate);
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/shows/movie/${id}?date=${dateStr}&city=${selectedCity}`)
      .then(res => res.json())
      .then(setShows);
  }, [id, activeDate, selectedCity]);

  // Group shows by cinema
  const cinemas = shows.reduce((acc, show) => {
    const key = show.cinema_id;
    if (!acc[key]) acc[key] = { cinema_name: show.cinema_name, address: show.address, city: show.city, shows: [] };
    acc[key].shows.push(show);
    return acc;
  }, {});

  const getAvailabilityColor = (avail) => {
    if (avail > 20) return '#1ea83c';
    if (avail > 5) return '#f5a623';
    return '#e74c3c';
  };

  const getFullLanguage = (lang) => {
    const map = { 'EN': 'English', 'HI': 'Hindi', 'TA': 'Tamil', 'TE': 'Telugu', 'ML': 'Malayalam', 'KN': 'Kannada' };
    return map[lang] || lang;
  };

  if (!movie) return <div style={{ padding: '4rem', textAlign: 'center' }}>Loading...</div>;

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: '#333545', padding: '1.5rem 4rem', color: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => navigate(-1)}>← Back</span>
          <h1 style={{ fontSize: '1.4rem' }}>{movie.title}</h1>
          <span style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>UA</span>
          <span style={{ opacity: 0.7, fontSize: '0.85rem' }}>{movie.duration_mins} min • {getFullLanguage(movie.language)} • {movie.genre}</span>
        </div>

        {/* 7-Day Date Scroller */}
        <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '4px' }}>
          {dates.map((d, i) => {
            const isActive = toDateStr(d) === toDateStr(activeDate);
            const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short' });
            const dateNum = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            return (
              <div
                key={i}
                onClick={() => setSelectedDate(d)}
                style={{
                  minWidth: '70px', textAlign: 'center', padding: '8px 12px', borderRadius: '8px',
                  cursor: 'pointer', border: isActive ? '2px solid var(--bms-red)' : '2px solid rgba(255,255,255,0.2)',
                  background: isActive ? 'var(--bms-red)' : 'rgba(255,255,255,0.08)',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>{dayName}</div>
                <div style={{ fontWeight: 'bold', marginTop: '2px' }}>{dateNum}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ background: 'white', padding: '0.75rem 4rem', borderBottom: '1px solid #eee', display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={{ color: '#666', fontSize: '0.85rem', fontWeight: '500' }}>Filters:</span>
        {['All', '2D', 'IMAX', '3D'].map(f => (
          <div
            key={f}
            onClick={() => setFormatFilter(f)}
            style={{
              padding: '4px 14px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer',
              border: `1px solid ${formatFilter === f ? 'var(--bms-red)' : '#ddd'}`,
              color: formatFilter === f ? 'var(--bms-red)' : '#555',
              background: formatFilter === f ? '#fff0f3' : 'white'
            }}
          >{f}</div>
        ))}
        <div style={{ marginLeft: '1rem', display: 'flex', gap: '0.5rem' }}>
          {['All', 'English', 'Hindi', 'Tamil'].map(l => (
            <div
              key={l}
              onClick={() => setLangFilter(l)}
              style={{
                padding: '4px 14px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer',
                border: `1px solid ${langFilter === l ? '#1a73e8' : '#ddd'}`,
                color: langFilter === l ? '#1a73e8' : '#555',
                background: langFilter === l ? '#e8f0fe' : 'white'
              }}
            >{l}</div>
          ))}
        </div>
      </div>

      {/* Cinema Listings */}
      <div style={{ padding: '1.5rem 4rem' }}>
        {Object.keys(cinemas).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#666' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem', height: '3rem' }}></div>
            <h3>No shows scheduled for this date.</h3>
            <p>Try selecting a different date above.</p>
          </div>
        ) : (
          Object.keys(cinemas).map(cinemaId => (
            <div key={cinemaId} style={{ background: 'white', borderRadius: '8px', marginBottom: '1rem', boxShadow: '0 2px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--bms-red)', fontSize: '1.1rem' }}>❤</span>
                      <span style={{ fontWeight: '700', fontSize: '1rem', color: '#222' }}>{cinemas[cinemaId].cinema_name}</span>
                    </div>
                    <div style={{ color: '#666', fontSize: '0.8rem', marginTop: '4px' }}>
                      {cinemas[cinemaId].address}, {cinemas[cinemaId].city}
                    </div>
                  </div>
                  {/* Cinema amenity icons */}
                  <div style={{ display: 'flex', gap: '8px', fontSize: '0.7rem', color: '#888' }}>
                    <span title="M-Ticket">📱 M-Ticket</span>
                    <span title="Food & Beverages">🍿 F&B</span>
                    <span title="Wheelchair Accessible">♿ Accessible</span>
                  </div>
                </div>
              </div>
              <div style={{ padding: '1rem 1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {cinemas[cinemaId].shows.map(show => (
                  <div
                    key={show.show_id}
                    onClick={() => navigate(`/seatlayout/${show.show_id}`)}
                    style={{
                      border: `1px solid ${getAvailabilityColor(show.available_seats)}`,
                      color: getAvailabilityColor(show.available_seats),
                      padding: '10px 18px', borderRadius: '4px', cursor: 'pointer',
                      textAlign: 'center', transition: 'all 0.15s',
                      background: 'white', minWidth: '90px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f9f9f9'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                  >
                    <div style={{ fontWeight: '700', fontSize: '1rem' }}>
                      {new Date(show.show_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '3px' }}>{show.screen_name}</div>
                    {parseFloat(show.surge_multiplier) > 1.0 && (
                      <div style={{ fontSize: '0.6rem', color: 'orange', fontWeight: 'bold', marginTop: '2px' }}>Surge</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ShowTimings;
