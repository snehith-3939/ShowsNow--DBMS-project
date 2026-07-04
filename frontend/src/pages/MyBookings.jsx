import { useEffect, useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';

const MyBookings = () => {
  const { user, token } = useContext(AppContext);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    const fetchBookings = async () => {
      try {
        const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/user/bookings', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch bookings');
        const data = await res.json();
        setBookings(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, [user, token, navigate]);

  if (loading) return <div style={{ padding: '4rem', textAlign: 'center' }}>Loading your tickets...</div>;
  if (error) return <div style={{ padding: '4rem', textAlign: 'center', color: 'red' }}>Error: {error}</div>;

  return (
    <div style={{ padding: '2rem 4rem', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '2rem' }}>My Bookings</h1>
      
      {bookings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#f5f5f5', borderRadius: '12px' }}>
          <h3>No bookings found</h3>
          <p>Looks like you haven't booked any movies yet!</p>
          <button 
            onClick={() => navigate('/')}
            style={{ marginTop: '1rem', padding: '10px 20px', background: 'var(--bms-red)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
          >
            Browse Movies
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {bookings.map(b => (
            <div key={b.booking_id} style={{ display: 'flex', border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
              {b.poster_url && (
                <img src={b.poster_url} alt={b.title} style={{ width: '120px', objectFit: 'cover' }} />
              )}
              <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h2 style={{ margin: '0 0 0.5rem 0' }}>{b.title}</h2>
                <div style={{ color: '#666', fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                  <strong>{b.cinema_name}</strong>, {b.city} • Screen {b.screen_name}
                </div>
                <div style={{ color: '#444', marginBottom: '1rem' }}>
                  Showtime: {new Date(b.show_time).toLocaleString()}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>₹{b.total_amount}</span>
                  <span style={{ 
                    padding: '4px 12px', 
                    borderRadius: '20px', 
                    fontSize: '0.85rem', 
                    fontWeight: 'bold',
                    background: b.status === 'Confirmed' ? '#d4edda' : b.status === 'Cancelled' ? '#f8d7da' : '#fff3cd',
                    color: b.status === 'Confirmed' ? '#155724' : b.status === 'Cancelled' ? '#721c24' : '#856404'
                  }}>
                    {b.status}
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

export default MyBookings;
