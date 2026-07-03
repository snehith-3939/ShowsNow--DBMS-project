import { useEffect, useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../api';

const Waitlist = () => {
  const { user, token } = useContext(AppContext);
  const [waitlist, setWaitlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    const fetchWaitlist = async () => {
      try {
        const res = await fetch(apiUrl('/api/user/waitlist'), {
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
  }, [user, token, navigate]);

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center' }}>Loading your waitlist...</div>;
  if (error) return <div style={{ padding: '4rem', textAlign: 'center', color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ padding: '2rem 4rem', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '2rem' }}>My Waitlists</h1>
      
      {waitlist.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#f5f5f5', borderRadius: '12px' }}>
          <h3>No active waitlists</h3>
          <p>You aren't queued up for any sold-out movies.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {waitlist.map(w => (
            <div key={w.waitlist_id} style={{ display: 'flex', border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              {w.poster_url && (
                <img src={w.poster_url} alt={w.title} style={{ width: '120px', objectFit: 'cover' }} />
              )}
              <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h2 style={{ margin: '0 0 0.5rem 0' }}>{w.title}</h2>
                <div style={{ color: '#666', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                  <strong>{w.cinema_name}</strong>
                </div>
                <div style={{ color: '#444', marginBottom: '1rem' }}>
                  Showtime: {new Date(w.show_time).toLocaleString()}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '500', fontSize: '0.95rem' }}>Requested: {w.requested_seats} Seats</span>
                  <span style={{ 
                    padding: '4px 12px', 
                    borderRadius: '20px', 
                    fontSize: '0.85rem', 
                    fontWeight: 'bold',
                    background: w.status === 'Auto-Booked' ? '#d4edda' : w.status === 'Waiting' ? '#cce5ff' : '#e2e3e5',
                    color: w.status === 'Auto-Booked' ? '#155724' : w.status === 'Waiting' ? '#004085' : '#383d41'
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
