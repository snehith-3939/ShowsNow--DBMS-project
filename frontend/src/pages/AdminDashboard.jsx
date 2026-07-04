import { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import Navbar from '../components/Navbar';

const AdminDashboard = () => {
  const { user, token } = useContext(AppContext);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminError, setAdminError] = useState('');

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

  // Pricing State
  const [shows, setShows] = useState([]);
  const [pricingForm, setPricingForm] = useState({ show_id: '', base_price: '' });

  const readJsonOrThrow = async (res, label) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`${label} failed (${res.status}): ${data.error || 'Unexpected response'}`);
    }
    return data;
  };

  const expectArray = (value, label) => {
    if (!Array.isArray(value)) {
      throw new Error(`${label} returned ${typeof value}, expected array`);
    }
    return value;
  };

  const expectAdminStats = (value) => {
    if (!value || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, 'totalRevenue')) {
      throw new Error('Admin stats response is missing totalRevenue');
    }
    if (!Number.isFinite(Number(value.totalRevenue))) {
      throw new Error(`Admin stats totalRevenue is not numeric: ${value.totalRevenue}`);
    }
    return value;
  };

  const fetchData = async () => {
    try {
      setAdminError('');
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, bookingsRes, moviesRes, cinemasRes, screensRes, waitlistsRes] = await Promise.all([
        fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/admin/stats', { headers }),
        fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/admin/bookings', { headers }),
        fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/movies'),
        fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/cinemas'),
        fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/screens'),
        fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/admin/waitlists', { headers })
      ]);

      const statsData = expectAdminStats(await readJsonOrThrow(statsRes, 'Admin stats'));
      const bookingsData = expectArray(await readJsonOrThrow(bookingsRes, 'Admin bookings'), 'Admin bookings');
      const moviesData = expectArray(await readJsonOrThrow(moviesRes, 'Movies'), 'Movies');
      const cinemasData = expectArray(await readJsonOrThrow(cinemasRes, 'Cinemas'), 'Cinemas');
      const screensData = expectArray(await readJsonOrThrow(screensRes, 'Screens'), 'Screens');
      const waitlistsData = expectArray(await readJsonOrThrow(waitlistsRes, 'Admin waitlists'), 'Admin waitlists');

      setStats(statsData);
      setBookings(bookingsData);
      setMovies(moviesData);
      setCinemas(cinemasData);
      setScreens(screensData);
      setWaitlists(waitlistsData);
    } catch (error) {
      console.error('Failed to fetch admin data:', error);
      setAdminError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchShows = async () => {
    try {
      // Basic fetch to populate shows for pricing rules
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/movies');
      // For a real app we'd fetch all raw shows. Since we only have /api/movies/:id/shows, we'll keep this simple.
      // In this demo, we'll just show the UI for it.
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      navigate('/');
      return;
    }
    fetchData();
  }, [user, navigate]);

  const handleUpdatePrice = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/admin/shows/${pricingForm.show_id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ base_price: pricingForm.base_price })
      });
      if (res.ok) {
        alert('Price updated successfully!');
        setPricingForm({ show_id: '', base_price: '' });
      }
    } catch { alert('Error updating price'); }
  };

  const handleAddMovie = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/admin/movies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/admin/shows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(showForm)
      });
      if (res.ok) {
        alert('Show added successfully!');
        setShowForm({ movie_id: '', screen_id: '', show_time: '', base_price: '' });
        fetchData();
      }
    } catch { alert('Error adding show'); }
  };

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center', color: 'white' }}>Loading Dashboard...</div>;

  return (
    <>
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 72px)', background: 'var(--bms-dark)' }}>
        {/* Sidebar */}
        <div style={{ width: '280px', background: '#121212', borderRight: '1px solid rgba(255,255,255,0.05)', padding: '2rem 1rem' }}>
          <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--bms-muted)', fontWeight: 'bold', marginBottom: '1.5rem', paddingLeft: '1rem', letterSpacing: '1px' }}>Admin Dashboard</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {[
              { id: 'overview', label: 'Overview', icon: '' },
              { id: 'movies', label: 'Movies', icon: '' },
              { id: 'shows', label: 'Schedules', icon: '' },
              { id: 'pricing', label: 'Pricing Rules', icon: '' },
              { id: 'waitlist', label: 'Waitlists', icon: '' },
              { id: 'bookings', label: 'Global Bookings', icon: '' },
            ].map(tab => (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: activeTab === tab.id ? 'rgba(200, 169, 110, 0.1)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--bms-red)' : '#E5E7EB',
                  transition: '0.2s',
                  fontWeight: activeTab === tab.id ? '600' : '400',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <span>{tab.icon}</span> {tab.label}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: '3rem 4rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: '800', color: 'white' }}>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h1>
            <div style={{ fontSize: '0.9rem', color: 'var(--bms-muted)' }}>Logged in as {user.name} <span style={{ padding: '3px 8px', background: 'rgba(200, 169, 110, 0.2)', color: 'var(--bms-red)', borderRadius: '4px', marginLeft: '10px', fontSize: '0.8rem', fontWeight: 'bold' }}>ADMIN</span></div>
          </div>

          {adminError && (
            <div style={{ ...cardStyle, border: '1px solid rgba(239, 68, 68, 0.45)', color: '#fecaca', marginBottom: '1.5rem' }}>
              {adminError}
            </div>
          )}

          {activeTab === 'overview' && stats && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                <StatCard title="Total Revenue" value={`₹${Number(stats.totalRevenue).toLocaleString()}`} color="#22c55e" />
                <StatCard title="Total Bookings" value={stats.totalBookings} color="#3b82f6" />
                <StatCard title="Live Movies" value={stats.totalMovies} color="#a855f7" />
                <StatCard title="Total Users" value={stats.totalUsers} color="var(--bms-red)" />
              </div>

              <div style={cardStyle}>
                <h3 style={{ marginBottom: '1.5rem', color: 'white' }}>Revenue by City</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--bms-muted)', fontSize: '0.85rem', textAlign: 'left' }}>
                        <th style={{ padding: '12px' }}>City</th>
                        <th style={{ padding: '12px' }}>Total Bookings</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.cityRevenue && stats.cityRevenue.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.95rem', color: '#E5E7EB' }}>
                          <td style={{ padding: '12px', fontWeight: '500' }}>{row.city}</td>
                          <td style={{ padding: '12px' }}>{row.total_bookings}</td>
                          <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', color: '#4ade80' }}>
                            ₹{parseFloat(row.revenue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'movies' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
              <div style={cardStyle}>
                <h3 style={{color: 'white', marginBottom: '1.5rem'}}>Add New Movie</h3>
                <form onSubmit={handleAddMovie}>
                  <label style={labelStyle}>Title</label>
                  <input style={inputStyle} value={movieForm.title} onChange={e => setMovieForm({...movieForm, title: e.target.value})} required />
                  <label style={labelStyle}>Genre</label>
                  <input style={inputStyle} value={movieForm.genre} onChange={e => setMovieForm({...movieForm, genre: e.target.value})} required />
                  <label style={labelStyle}>Language</label>
                  <input style={inputStyle} value={movieForm.language} onChange={e => setMovieForm({...movieForm, language: e.target.value})} required />
                  <label style={labelStyle}>Duration (mins)</label>
                  <input type="number" style={inputStyle} value={movieForm.duration_mins} onChange={e => setMovieForm({...movieForm, duration_mins: e.target.value})} required />
                  <label style={labelStyle}>Poster URL</label>
                  <input style={inputStyle} value={movieForm.poster_url} onChange={e => setMovieForm({...movieForm, poster_url: e.target.value})} />
                  <button type="submit" style={submitBtnStyle}>Create Movie</button>
                </form>
              </div>
              <div style={cardStyle}>
                <h3 style={{color: 'white', marginBottom: '1.5rem'}}>Movie Catalog</h3>
                <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--bms-muted)', fontSize: '0.85rem', textAlign: 'left' }}>
                        <th style={{ padding: '12px' }}>Poster</th>
                        <th style={{ padding: '12px' }}>Title</th>
                        <th style={{ padding: '12px' }}>Genre</th>
                        <th style={{ padding: '12px' }}>Language</th>
                        <th style={{ padding: '12px' }}>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movies.map(m => (
                        <tr key={m.movie_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem', color: '#E5E7EB' }}>
                          <td style={{ padding: '12px' }}><img src={m.poster_url} style={{ width: '40px', borderRadius: '4px' }} alt="" /></td>
                          <td style={{ padding: '12px', fontWeight: '500' }}>{m.title}</td>
                          <td style={{ padding: '12px', color: 'var(--bms-muted)' }}>{m.genre}</td>
                          <td style={{ padding: '12px', color: 'var(--bms-muted)' }}>{m.language}</td>
                          <td style={{ padding: '12px', color: 'var(--bms-muted)' }}>{m.duration_mins}m</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'shows' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
              <div style={cardStyle}>
                <h3 style={{color: 'white', marginBottom: '1.5rem'}}>Schedule New Show</h3>
                <form onSubmit={handleAddShow}>
                  <label style={labelStyle}>Movie</label>
                  <select style={inputStyle} value={showForm.movie_id} onChange={e => setShowForm({...showForm, movie_id: e.target.value})} required>
                    <option value="">Select Movie</option>
                    {movies.map(m => <option key={m.movie_id} value={m.movie_id}>{m.title}</option>)}
                  </select>
                  <label style={labelStyle}>Screen</label>
                  <select style={inputStyle} value={showForm.screen_id} onChange={e => setShowForm({...showForm, screen_id: e.target.value})} required>
                    <option value="">Select Screen</option>
                    {screens.map(s => {
                       const c = cinemas.find(cin => cin.cinema_id === s.cinema_id);
                       return <option key={s.screen_id} value={s.screen_id}>{c ? c.name : ''} - {s.name}</option>;
                    })}
                  </select>
                  <label style={labelStyle}>Show Time</label>
                  <input type="datetime-local" style={inputStyle} value={showForm.show_time} onChange={e => setShowForm({...showForm, show_time: e.target.value})} required />
                  <label style={labelStyle}>Base Price (₹)</label>
                  <input type="number" style={inputStyle} value={showForm.base_price} onChange={e => setShowForm({...showForm, base_price: e.target.value})} required />
                  <button type="submit" style={submitBtnStyle}>Schedule Show</button>
                </form>
              </div>
              <div style={cardStyle}>
                <h3 style={{color: 'white', marginBottom: '1.5rem'}}>Global Shows Database</h3>
                <p style={{color: 'var(--bms-muted)', fontSize: '0.9rem'}}>Upcoming shows will appear on the user's booking interface based on their selected city.</p>
                <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', color: '#888', textAlign: 'center', marginTop: '1rem' }}>
                  Select a city on the main app to view its localized show schedules.<br/><br/><i>Admin view of all raw global shows is coming soon.</i>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pricing' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
               <div style={cardStyle}>
                 <h3 style={{color: 'white', marginBottom: '1rem'}}>Manual Base Price Override</h3>
                 <p style={{color: 'var(--bms-muted)', fontSize: '0.9rem', marginBottom: '2rem'}}>Use this form to manually override the base price of a specific show. The surge multiplier trigger will automatically recalculate the final price based on the new base price.</p>
                 <form onSubmit={handleUpdatePrice}>
                    <label style={labelStyle}>Show ID</label>
                    <input style={inputStyle} placeholder="Enter Show UUID" value={pricingForm.show_id} onChange={e => setPricingForm({...pricingForm, show_id: e.target.value})} required />
                    
                    <label style={labelStyle}>New Base Price (₹)</label>
                    <input type="number" style={inputStyle} placeholder="e.g. 250" value={pricingForm.base_price} onChange={e => setPricingForm({...pricingForm, base_price: e.target.value})} required />
                    
                    <button type="submit" style={submitBtnStyle}>Update Price</button>
                 </form>
               </div>
               
               <div style={{...cardStyle, background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(0,0,0,0.8))', border: '1px solid rgba(168, 85, 247, 0.3)'}}>
                 <h3 style={{color: '#c084fc', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px'}}>
                   <img src="/logo_icon.png" alt="Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
                   Autonomous Surge Engine
                 </h3>
                 <p style={{color: 'var(--bms-text)', fontSize: '0.95rem', lineHeight: '1.6'}}>
                   The DBMS is currently handling dynamic pricing autonomously via a PL/pgSQL trigger (`update_show_availability_and_surge`). 
                   <br/><br/>
                   <strong>Current Rules:</strong><br/>
                   • &lt; 40% occupancy = 1.0x multiplier<br/>
                   • 40% - 70% occupancy = 1.2x multiplier<br/>
                   • &gt; 70% occupancy = 1.5x multiplier<br/>
                 </p>
               </div>
            </div>
          )}

          {activeTab === 'waitlist' && (
            <div style={cardStyle}>
              <h3 style={{color: 'white', marginBottom: '1rem'}}>Active Waitlists</h3>
              <p style={{color: 'var(--bms-muted)', fontSize: '0.9rem', marginBottom: '2rem'}}>Monitor high-demand shows. The backend waitlist engine uses FOR UPDATE SKIP LOCKED to autonomously promote users when cancellations occur.</p>
              
              <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--bms-muted)', fontSize: '0.85rem', textAlign: 'left' }}>
                        <th style={{ padding: '12px' }}>Show ID</th>
                        <th style={{ padding: '12px' }}>User ID</th>
                        <th style={{ padding: '12px' }}>Status</th>
                        <th style={{ padding: '12px', textAlign: 'right' }}>Joined At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waitlists.length === 0 ? (
                        <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No active waitlists currently.</td></tr>
                      ) : (
                        waitlists.map(w => (
                          <tr key={w.waitlist_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem', color: '#E5E7EB' }}>
                            <td style={{ padding: '12px' }}>
                              <div>{w.movie_title}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--bms-muted)' }}>{new Date(w.show_time).toLocaleString()}</div>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <div>{w.user_name}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--bms-muted)' }}>{w.user_email}</div>
                            </td>
                            <td style={{ padding: '12px' }}>
                              <span style={{ 
                                padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700',
                                background: w.status === 'Auto-Booked' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                                color: w.status === 'Auto-Booked' ? '#4ade80' : '#eab308'
                              }}>
                                {w.status.toUpperCase()} ({w.requested_seats} seats)
                              </span>
                            </td>
                            <td style={{ padding: '12px', textAlign: 'right', color: 'var(--bms-muted)' }}>{new Date(w.joined_at).toLocaleDateString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
              </div>
            </div>
          )}

          {/* Keep Movies and Shows and Bookings tabs similar to original but styled */}
          {activeTab === 'bookings' && (
            <div style={cardStyle}>
              <h3 style={{color: 'white', marginBottom: '1rem'}}>All Transactions</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--bms-muted)', fontSize: '0.85rem' }}>
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
                      <tr key={b.booking_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem', color: '#E5E7EB' }}>
                        <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--bms-muted)' }}>{b.booking_id.slice(0,8)}...</td>
                        <td style={{ padding: '12px' }}>
                          <div>{b.user_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--bms-muted)' }}>{b.user_email}</div>
                        </td>
                        <td style={{ padding: '12px' }}>{b.movie_title}</td>
                        <td style={{ padding: '12px', fontWeight: '600' }}>₹{parseFloat(b.total_amount).toFixed(2)}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ 
                            padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700',
                            background: b.status === 'Confirmed' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: b.status === 'Confirmed' ? '#4ade80' : '#f87171'
                          }}>
                            {b.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '12px', color: 'var(--bms-muted)' }}>{new Date(b.booking_time).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

const StatCard = ({ title, value, color }) => (
  <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', borderLeft: `4px solid ${color}` }}>
    <div style={{ fontSize: '0.85rem', color: 'var(--bms-muted)', marginBottom: '8px', fontWeight: '600', textTransform: 'uppercase' }}>{title}</div>
    <div style={{ fontSize: '2rem', fontWeight: '800', color: 'white' }}>{value}</div>
  </div>
);

const cardStyle = {
  background: 'var(--card-bg)',
  padding: '2rem',
  borderRadius: '16px',
  border: '1px solid rgba(255,255,255,0.05)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
};

const inputStyle = {
  width: '100%',
  padding: '12px',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '6px',
  marginBottom: '1.5rem',
  outline: 'none',
  fontSize: '0.95rem',
  boxSizing: 'border-box',
  color: 'white'
};

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  fontSize: '0.85rem',
  fontWeight: '600',
  color: 'var(--bms-muted)'
};

const submitBtnStyle = {
  width: '100%',
  padding: '14px',
  background: 'var(--bms-red)',
  color: '#0A0A0A',
  border: 'none',
  borderRadius: '6px',
  fontWeight: '700',
  cursor: 'pointer',
  transition: '0.2s',
  fontSize: '1rem'
};

export default AdminDashboard;
