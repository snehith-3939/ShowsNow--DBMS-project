import { useEffect, useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const Waitlist = () => {
  const { user, token, authLoading } = useContext(AppContext);
  const [waitlist, setWaitlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [leavingId, setLeavingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/'); return; }

    const fetchWaitlist = async () => {
      try {
        const res = await fetch(`${API}/api/user/waitlist`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch waitlist');
        setWaitlist(await res.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchWaitlist();
  }, [user, token, authLoading, navigate]);

  const handleLeave = async (waitlistId) => {
    if (!window.confirm('Remove yourself from this waitlist?')) return;
    setLeavingId(waitlistId);
    try {
      const res = await fetch(`${API}/api/waitlist/${waitlistId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setWaitlist(prev => prev.filter(w => w.waitlist_id !== waitlistId));
      } else {
        const d = await res.json();
        alert(d.error || 'Could not remove from waitlist.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setLeavingId(null);
    }
  };

  const statusColor = (s) => ({
    'Waiting':    { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa' },
    'Auto-Booked': { bg: 'rgba(34,197,94,0.15)',  text: '#4ade80' },
    'Expired':    { bg: 'rgba(255,255,255,0.06)', text: '#9ca3af' },
  }[s] || { bg: 'rgba(255,255,255,0.06)', text: '#aaa' });

  return (
    <>
      <Navbar />
      <div className="main-container" style={{ maxWidth: '900px', margin: '0 auto', paddingTop: '2rem', paddingBottom: '4rem' }}>
        <h2 className="section-title" style={{ marginBottom: '0.4rem' }}>My Waitlists</h2>
        <p style={{ color: 'var(--bms-muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>
          When a seat opens in a show you're waiting for, ShowsNow will automatically book it for you.
        </p>

        {loading && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--bms-muted)' }}>
            Loading your waitlists...
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#f87171' }}>
            {error}
          </div>
        )}

        {!loading && !error && waitlist.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '4rem',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '16px'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎟️</div>
            <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>No active waitlists</h3>
            <p style={{ color: 'var(--bms-muted)' }}>
              You're not queued for any sold-out shows right now.
            </p>
          </div>
        )}

        {!loading && !error && waitlist.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {waitlist.map(w => {
              const sc = statusColor(w.status);
              const showDate = new Date(w.show_time);
              const isUpcoming = showDate > new Date();
              return (
                <div key={w.waitlist_id} className="movie-card" style={{ display: 'flex', overflow: 'hidden', padding: 0 }}>
                  {w.poster_url && (
                    <img
                      src={w.poster_url}
                      alt={w.title || w.movie_title}
                      style={{ width: '110px', objectFit: 'cover', flexShrink: 0 }}
                    />
                  )}
                  <div style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                        <div>
                          <h3 style={{ color: 'white', margin: '0 0 4px 0', fontSize: '1.15rem' }}>
                            {w.title || w.movie_title}
                          </h3>
                          <p style={{ color: 'var(--bms-muted)', margin: 0, fontSize: '0.88rem' }}>
                            {w.cinema_name}{w.city ? ` • ${w.city}` : ''}
                          </p>
                        </div>
                        <span style={{
                          padding: '4px 12px', borderRadius: '20px',
                          fontSize: '0.78rem', fontWeight: 700,
                          background: sc.bg, color: sc.text, whiteSpace: 'nowrap', flexShrink: 0
                        }}>
                          {w.status}
                        </span>
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.85rem', marginTop: '10px' }}>
                        🕐 {showDate.toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.85rem' }}>
                      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                        🎟️ {w.requested_seats} seat{w.requested_seats !== 1 ? 's' : ''} requested
                        <span style={{ marginLeft: '12px', color: 'var(--bms-muted)', fontSize: '0.78rem' }}>
                          Joined {new Date(w.joined_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </span>
                      </span>
                      {w.status === 'Waiting' && isUpcoming && (
                        <button
                          disabled={leavingId === w.waitlist_id}
                          onClick={() => handleLeave(w.waitlist_id)}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(239,68,68,0.45)',
                            color: '#f87171', borderRadius: '8px',
                            padding: '6px 16px', fontSize: '0.82rem',
                            cursor: leavingId === w.waitlist_id ? 'not-allowed' : 'pointer',
                            opacity: leavingId === w.waitlist_id ? 0.5 : 1,
                            transition: 'all 0.15s'
                          }}
                        >
                          {leavingId === w.waitlist_id ? 'Removing...' : 'Leave Waitlist'}
                        </button>
                      )}
                      {w.status === 'Auto-Booked' && (
                        <button
                          onClick={() => navigate('/profile')}
                          className="btn-signin"
                          style={{ fontSize: '0.82rem', padding: '6px 16px' }}
                        >
                          View Booking →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default Waitlist;
