import { useEffect, useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';

const Waitlist = () => {
  const { user, token, authLoading } = useContext(AppContext);
  const [waitlist, setWaitlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/');
      return;
    }

    const fetchWaitlist = async () => {
      try {
        const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/user/waitlist', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch waitlist');
        const data = await res.json();
        setWaitlist(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchWaitlist();
  }, [user, token, authLoading, navigate]);

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center' }}>Loading your waitlist...</div>;
  if (error) return <div style={{ padding: '4rem', textAlign: 'center', color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ padding: '4rem', maxWidth: '1000px', margin: '0 auto', color: 'white', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '2rem' }}>My Waitlists</h1>
      
      {waitlist.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#1a1c23', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ color: 'white' }}>No active waitlists</h3>
          <p style={{ color: 'var(--bms-muted)' }}>You aren't queued up for any sold-out movies.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {waitlist.map(w => (
            <div key={w.waitlist_id} style={{ display: 'flex', background: '#1a1c23', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
              {w.poster_url && (
                <img src={w.poster_url} alt={w.title} style={{ width: '140px', objectFit: 'cover' }} />
              )}
              <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h2 style={{ margin: '0 0 0.5rem 0', color: 'white' }}>{w.title}</h2>
                <div style={{ color: 'var(--bms-muted)', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                  <strong>{w.cinema_name}</strong>
                </div>
                <div style={{ color: 'var(--bms-muted)', marginBottom: '1rem' }}>
                  Showtime: {new Date(w.show_time).toLocaleString()}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '500', fontSize: '0.95rem', color: 'white' }}>Requested: {w.requested_seats} Seats</span>
                  <span style={{ 
                    padding: '4px 12px', 
                    borderRadius: '20px', 
                    fontSize: '0.85rem', 
                    fontWeight: 'bold',
                    background: w.status === 'Auto-Booked' ? 'rgba(34, 197, 94, 0.2)' : w.status === 'Waiting' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.1)',
                    color: w.status === 'Auto-Booked' ? '#4ade80' : w.status === 'Waiting' ? '#60a5fa' : '#aaa'
                  }}>
                    {w.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Waitlist;
