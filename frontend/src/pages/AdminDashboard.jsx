import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { apiUrl } from '../api';

const AdminDashboard = () => {
  const { user, token } = useContext(AppContext);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Forms State
  const [movieForm, setMovieForm] = useState({
    title: '', genre: '', duration_mins: '', language: '', poster_url: '', banner_url: '', overview: ''
  });
  const [showForm, setShowForm] = useState({
    movie_id: '', screen_id: '', show_time: '', base_price: ''
  });
  const [movies, setMovies] = useState([]);
  const [cinemas, setCinemas] = useState([]);
  const [screens, setScreens] = useState([]);

  const fetchData = async () => {
    try {
      const [statsRes, bookingsRes, moviesRes, cinemasRes, screensRes] = await Promise.all([
        fetch(apiUrl('/api/admin/stats'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/api/admin/bookings'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/api/movies')),
        fetch(apiUrl('/api/cinemas')),
        fetch(apiUrl('/api/screens'))
      ]);

      const statsData = await statsRes.json();
      const bookingsData = await bookingsRes.json();
      const moviesData = await moviesRes.json();
      const cinemasData = await cinemasRes.json();
      const screensData = await screensRes.json();

      setStats(statsData);
      setBookings(bookingsData);
      setMovies(moviesData);
      setCinemas(cinemasData);
      setScreens(screensData);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigate]);

  const handleAddMovie = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(apiUrl('/api/admin/movies'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(movieForm)
      });
      if (res.ok) {
        alert('Movie added successfully!');
        setMovieForm({ title: '', genre: '', duration_mins: '', language: '', poster_url: '', banner_url: '', overview: '' });
        fetchData();
      }
    } catch { alert('Error adding movie'); }
  };

  const handleAddShow = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(apiUrl('/api/admin/shows'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(showForm)
      });
      if (res.ok) {
        alert('Show scheduled successfully!');
        setShowForm({ movie_id: '', screen_id: '', show_time: '', base_price: '' });
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Error scheduling show');
      }
    } catch { alert('Error scheduling show'); }
  };

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center' }}>Loading Dashboard...</div>;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8f9fa' }}>
      {/* Sidebar */}
      <div style={{ width: '260px', background: '#1a1c23', color: 'white', padding: '2rem 1rem' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '2rem', padding: '0 1rem', color: 'var(--bms-red)' }}>Admin Panel</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { id: 'overview', label: '📊 Overview', icon: '' },
            { id: 'movies', label: '🎬 Movies', icon: '' },
            { id: 'shows', label: '🕒 Schedules', icon: '' },
            { id: 'bookings', label: '🎟️ Global Bookings', icon: '' },
          ].map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                background: activeTab === tab.id ? 'var(--bms-red)' : 'transparent',
                transition: '0.2s',
                fontWeight: activeTab === tab.id ? '600' : '400'
              }}
            >
              {tab.label}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: '2rem 3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.8rem', fontWeight: '700' }}>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h1>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>Welcome, {user.name} (Admin)</div>
        </div>

        {activeTab === 'overview' && stats && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
              <StatCard title="Total Revenue" value={`₹${parseFloat(stats.totalRevenue).toLocaleString()}`} color="#27ae60" />
              <StatCard title="Total Bookings" value={stats.totalBookings} color="#2980b9" />
              <StatCard title="Live Movies" value={stats.totalMovies} color="#8e44ad" />
              <StatCard title="Total Users" value={stats.totalUsers} color="#f39c12" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <h3 style={{ marginBottom: '1rem', color: '#333' }}>Revenue by City (SQL View)</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #eee', color: '#888', fontSize: '0.85rem', textAlign: 'left' }}>
                        <th style={{ padding: '10px' }}>City</th>
                        <th style={{ padding: '10px' }}>Total Bookings</th>
                        <th style={{ padding: '10px', textAlign: 'right' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.cityRevenue && stats.cityRevenue.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee', fontSize: '0.95rem' }}>
                          <td style={{ padding: '10px', fontWeight: '500' }}>{row.city}</td>
                          <td style={{ padding: '10px' }}>{row.total_bookings}</td>
                          <td style={{ padding: '10px', textAlign: 'right', fontWeight: '700', color: '#27ae60' }}>
                            ₹{parseFloat(row.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                      {(!stats.cityRevenue || stats.cityRevenue.length === 0) && (
                        <tr><td colSpan="3" style={{ padding: '10px', textAlign: 'center', color: '#aaa' }}>No revenue data yet</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ marginBottom: '1rem' }}>Quick Actions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, justifyContent: 'center' }}>
                  <button onClick={() => setActiveTab('movies')} style={{...actionBtnStyle, padding: '15px', background: '#333545', color: 'white'}}>➕ Add New Movie</button>
                  <button onClick={() => setActiveTab('shows')} style={{...actionBtnStyle, padding: '15px', background: 'var(--bms-red)', color: 'white', border: 'none'}}>🕒 Schedule a Show</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'movies' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div style={cardStyle}>
              <h3>Add New Movie</h3>
              <form onSubmit={handleAddMovie}>
                <input style={inputStyle} placeholder="Title" value={movieForm.title} onChange={e => setMovieForm({...movieForm, title: e.target.value})} required />
                <input style={inputStyle} placeholder="Genre (e.g. Action, Drama)" value={movieForm.genre} onChange={e => setMovieForm({...movieForm, genre: e.target.value})} required />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input style={inputStyle} placeholder="Duration (mins)" type="number" value={movieForm.duration_mins} onChange={e => setMovieForm({...movieForm, duration_mins: e.target.value})} required />
                  <input style={inputStyle} placeholder="Language" value={movieForm.language} onChange={e => setMovieForm({...movieForm, language: e.target.value})} required />
                </div>
                <input style={inputStyle} placeholder="Poster URL" value={movieForm.poster_url} onChange={e => setMovieForm({...movieForm, poster_url: e.target.value})} />
                <input style={inputStyle} placeholder="Banner URL" value={movieForm.banner_url} onChange={e => setMovieForm({...movieForm, banner_url: e.target.value})} />
                <textarea style={{...inputStyle, height: '100px'}} placeholder="Overview" value={movieForm.overview} onChange={e => setMovieForm({...movieForm, overview: e.target.value})} />
                <button type="submit" style={submitBtnStyle}>Create Movie</button>
              </form>
            </div>
            <div style={cardStyle}>
              <h3>Current Inventory</h3>
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {movies.map(m => (
                  <div key={m.movie_id} style={{ display: 'flex', gap: '10px', padding: '10px 0', borderBottom: '1px solid #eee' }}>
                    <img src={m.poster_url} style={{ width: '40px', height: '60px', borderRadius: '4px', objectFit: 'cover' }} />
                    <div>
                      <div style={{ fontWeight: '600' }}>{m.title}</div>
                      <div style={{ fontSize: '0.8rem', color: '#888' }}>{m.genre} • {m.language}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'shows' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div style={cardStyle}>
              <h3>Schedule a Show</h3>
              <form onSubmit={handleAddShow}>
                <label style={labelStyle}>1. Select Movie</label>
                <select style={inputStyle} value={showForm.movie_id} onChange={e => setShowForm({...showForm, movie_id: e.target.value})} required>
                  <option value="">Choose Movie...</option>
                  {movies.map(m => <option key={m.movie_id} value={m.movie_id}>{m.title}</option>)}
                </select>

                <label style={labelStyle}>2. Select City</label>
                <select 
                  style={inputStyle} 
                  value={showForm.city || ''} 
                  onChange={e => setShowForm({...showForm, city: e.target.value, screen_id: ''})}
                >
                  <option value="">All Cities</option>
                  {[...new Set(cinemas.map(c => c.city))].map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>

                <label style={labelStyle}>3. Select Cinema & Screen</label>
                <select style={inputStyle} value={showForm.screen_id} onChange={e => setShowForm({...showForm, screen_id: e.target.value})} required>
                  <option value="">Choose Screen...</option>
                  {cinemas
                    .filter(c => !showForm.city || c.city === showForm.city)
                    .map(cinema => (
                    <optgroup key={cinema.cinema_id} label={`${cinema.name} (${cinema.city})`}>
                       {screens.filter(s => s.cinema_id === cinema.cinema_id).map(screen => (
                         <option key={screen.screen_id} value={screen.screen_id}>
                           {screen.name}
                         </option>
                       ))}
                    </optgroup>
                  ))}
                </select>

                <label style={labelStyle}>Date & Time</label>
                <input type="datetime-local" style={inputStyle} value={showForm.show_time} onChange={e => setShowForm({...showForm, show_time: e.target.value})} required />

                <label style={labelStyle}>Base Ticket Price (₹)</label>
                <input type="number" style={inputStyle} value={showForm.base_price} onChange={e => setShowForm({...showForm, base_price: e.target.value})} required />

                <button type="submit" style={submitBtnStyle}>Schedule Show</button>
              </form>
            </div>
            <div style={cardStyle}>
              <h3>Scheduling Tips</h3>
              <p style={{ color: '#666', fontSize: '0.9rem', lineHeight: '1.6' }}>
                • Avoid scheduling overlapping shows on the same screen.<br/>
                • Peak hour shows (after 6 PM) usually have higher demand.<br/>
                • Ensure the movie is already in the inventory before scheduling.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'bookings' && (
          <div style={cardStyle}>
            <h3>All Transactions</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee', color: '#888', fontSize: '0.8rem' }}>
                    <th style={{ padding: '12px' }}>ID</th>
                    <th style={{ padding: '12px' }}>Customer</th>
                    <th style={{ padding: '12px' }}>Movie</th>
                    <th style={{ padding: '12px' }}>Amount</th>
                    <th style={{ padding: '12px' }}>Status</th>
                    <th style={{ padding: '12px' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => (
                    <tr key={b.booking_id} style={{ borderBottom: '1px solid #eee', fontSize: '0.9rem' }}>
                      <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '0.75rem' }}>{b.booking_id.slice(0,8)}...</td>
                      <td style={{ padding: '12px' }}>
                        <div>{b.user_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#aaa' }}>{b.user_email}</div>
                      </td>
                      <td style={{ padding: '12px' }}>{b.movie_title}</td>
                      <td style={{ padding: '12px', fontWeight: '600' }}>₹{parseFloat(b.total_amount).toFixed(2)}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ 
                          padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '700',
                          background: b.status === 'Confirmed' ? '#e6fffa' : '#fff5f5',
                          color: b.status === 'Confirmed' ? '#2c7a7b' : '#c53030'
                        }}>
                          {b.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: '#666' }}>{new Date(b.booking_time).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ title, value, color }) => (
  <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', borderLeft: `5px solid ${color}` }}>
    <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase' }}>{title}</div>
    <div style={{ fontSize: '1.8rem', fontWeight: '700', color: '#333' }}>{value}</div>
  </div>
);

const cardStyle = {
  background: 'white',
  padding: '1.5rem',
  borderRadius: '12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
};

const inputStyle = {
  width: '100%',
  padding: '12px',
  border: '1px solid #ddd',
  borderRadius: '6px',
  marginBottom: '1rem',
  outline: 'none',
  fontSize: '0.95rem',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '0.85rem',
  fontWeight: '600',
  color: '#555'
};

const submitBtnStyle = {
  width: '100%',
  padding: '12px',
  background: '#1a1c23',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: '0.2s'
};

const actionBtnStyle = {
  padding: '10px 20px',
  background: '#f0f2f5',
  border: '1px solid #ddd',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '0.9rem'
};

export default AdminDashboard;
