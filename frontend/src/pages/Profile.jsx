import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { QRCodeSVG } from 'qrcode.react';

const Profile = () => {
  const [profile, setProfile] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loyalty, setLoyalty] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', city: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('bms_token');
    if (!token) {
      navigate('/');
      return;
    }

    const fetchData = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${token}` };
        
        // Fetch Profile
        const profileRes = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/user/profile', { headers });
        if (profileRes.ok) setProfile(await profileRes.json());

        // Fetch Loyalty
        const loyaltyRes = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/user/loyalty', { headers });
        if (loyaltyRes.ok) {
          const lData = await loyaltyRes.json();
          setLoyalty(lData.balance || 0);
        }

        // Fetch Bookings
        const bookingsRes = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/user/bookings', { headers });
        if (bookingsRes.ok) {
          const bData = await bookingsRes.json();
          setBookings(bData);
        }
      } catch (err) {
        console.error('Error fetching profile data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  if (loading) return <div style={{ color: 'white', textAlign: 'center', padding: '5rem' }}>Loading Profile...</div>;

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const token = localStorage.getItem('bms_token');
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(editForm)
      });
      if (res.ok) {
        const updatedProfile = await res.json();
        setProfile(updatedProfile);
        setIsEditing(false);
      } else {
        alert('Failed to update profile');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating profile');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <>
      <div className="main-container" style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', gap: '3rem' }}>
        
        {/* Sidebar / User Info */}
        <div style={{ flex: '0 0 350px' }}>
          <div className="movie-card" style={{ padding: '2rem', textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--bms-red), #555)', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', color: '#0A0A0A', fontWeight: 'bold' }}>
              {profile?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <h2 style={{ color: 'white', marginBottom: '0.5rem' }}>{profile?.name}</h2>
            <p style={{ color: 'var(--bms-muted)', marginBottom: '1.5rem' }}>{profile?.email}</p>
            <p style={{ color: 'var(--bms-muted)', fontSize: '0.9rem' }}>Phone: {profile?.phone || 'Not provided'}</p>
            <p style={{ color: 'var(--bms-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>City: {profile?.city || 'Not provided'}</p>
            
            <button 
              className="btn-signin" 
              style={{ width: '100%' }}
              onClick={() => {
                setEditForm({ name: profile?.name || '', phone: profile?.phone || '', city: profile?.city || '' });
                setIsEditing(true);
              }}
            >
              Edit Profile
            </button>
          </div>

          <div className="movie-card" style={{ padding: '2rem', background: 'linear-gradient(135deg, rgba(200, 169, 110, 0.1), rgba(0,0,0,0.8))', border: '1px solid rgba(200, 169, 110, 0.3)' }}>
            <h3 style={{ color: 'var(--bms-red)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>🪙</span> ShowsNow Coins
            </h3>
            <div style={{ fontSize: '3rem', fontWeight: '800', color: 'white', marginBottom: '0.5rem' }}>
              {loyalty}
            </div>
            <p style={{ color: 'var(--bms-muted)', fontSize: '0.85rem' }}>
              Earn 50 coins per ticket on Confirmed bookings. Use them at checkout for automatic discounts!
            </p>
          </div>
        </div>

        {/* Main Area / Booking History */}
        <div style={{ flex: 1 }}>
          <h2 className="section-title">Booking History</h2>
          
          {bookings.length === 0 ? (
            <div className="movie-card" style={{ padding: '4rem', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎫</div>
              <h3 style={{ color: 'white', marginBottom: '0.5rem' }}>No bookings yet</h3>
              <p style={{ color: 'var(--bms-muted)' }}>Looks like you haven't booked any shows yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {bookings.map(booking => (
                <div key={booking.booking_id} className="movie-card" style={{ display: 'flex', overflow: 'hidden', padding: 0 }}>
                  <img src={booking.poster_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(booking.title)}`} alt={booking.title} style={{ width: '140px', objectFit: 'cover' }} />
                  <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h3 style={{ color: 'white', fontSize: '1.3rem', marginBottom: '0.3rem' }}>{booking.title}</h3>
                        <p style={{ color: 'var(--bms-muted)', fontSize: '0.95rem' }}>{booking.cinema_name} • {booking.city}</p>
                        <p style={{ color: 'var(--bms-muted)', fontSize: '0.95rem' }}>{booking.screen_name}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ 
                          padding: '4px 12px', 
                          borderRadius: '4px', 
                          fontSize: '0.8rem', 
                          fontWeight: 'bold', 
                          display: 'inline-block',
                          background: booking.status === 'Confirmed' ? 'rgba(34, 197, 94, 0.2)' : booking.status === 'Cancelled' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: booking.status === 'Confirmed' ? '#4ade80' : booking.status === 'Cancelled' ? '#f87171' : '#fbbf24'
                        }}>
                          {booking.status.toUpperCase()}
                        </div>
                        <div style={{ marginTop: '0.5rem', color: 'white', fontWeight: 'bold' }}>₹{booking.total_amount}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                      <div>
                        <div style={{ color: 'white', fontWeight: '600' }}>{new Date(booking.show_time).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                        <div style={{ color: 'var(--bms-muted)', fontSize: '0.8rem', marginTop: '3px' }}>Booked on: {new Date(booking.booking_time).toLocaleDateString()}</div>
                      </div>
                      {booking.status === 'Confirmed' && new Date(booking.show_time) > new Date() && (
                        <button className="btn-signin" style={{ background: 'transparent', border: '1px solid var(--bms-red)', color: 'var(--bms-red)' }} onClick={() => setSelectedTicket(booking)}>
                          View Details
                        </button>
                      )}
                    </div>

                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1a1c23', padding: '2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', width: '90%', maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ color: 'white', margin: 0 }}>Edit Profile</h3>
              <span style={{ color: '#aaa', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setIsEditing(false)}>✕</span>
            </div>
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input 
                type="text" 
                placeholder="Name" 
                value={editForm.name} 
                onChange={e => setEditForm({...editForm, name: e.target.value})}
                required
                style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px' }}
              />
              <input 
                type="tel" 
                placeholder="Phone (optional)" 
                value={editForm.phone} 
                onChange={e => setEditForm({...editForm, phone: e.target.value})}
                style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px' }}
              />
              <input 
                type="text" 
                placeholder="City (optional)" 
                value={editForm.city} 
                onChange={e => setEditForm({...editForm, city: e.target.value})}
                style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px' }}
              />
              <button 
                type="submit" 
                disabled={savingProfile}
                style={{ padding: '12px', background: 'var(--bms-red)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', marginTop: '0.5rem' }}
              >
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Ticket Details Modal */}
      {selectedTicket && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1a1c23', padding: '2.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', width: '90%', maxWidth: '450px', textAlign: 'center', position: 'relative' }}>
            <span 
              onClick={() => setSelectedTicket(null)}
              style={{ position: 'absolute', top: '15px', right: '20px', color: '#aaa', fontSize: '1.2rem', cursor: 'pointer' }}
            >✕</span>
            
            <h2 style={{ color: 'white', marginBottom: '0.5rem' }}>Your Ticket</h2>
            <p style={{ color: 'var(--bms-muted)', marginBottom: '2rem' }}>Show this QR code at the entrance</p>
            
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
              <div style={{ background: 'white', padding: '15px', borderRadius: '8px' }}>
                <QRCodeSVG 
                  value={JSON.stringify({ 
                    id: selectedTicket.booking_id, 
                    movie: selectedTicket.title, 
                    seats: selectedTicket.seats ? selectedTicket.seats.map(s => `${s.row_no}${s.seat_no}`) : []
                  })} 
                  size={180} 
                  level="H" 
                />
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', textAlign: 'left' }}>
              <div style={{ color: 'var(--bms-red)', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '0.5rem' }}>{selectedTicket.title}</div>
              <div style={{ color: '#ccc', marginBottom: '0.5rem' }}>{selectedTicket.cinema_name} • {selectedTicket.screen_name}</div>
              <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '1rem' }}>
                {new Date(selectedTicket.show_time).toLocaleString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#777', fontSize: '0.8rem', textTransform: 'uppercase' }}>Seats</div>
                  <div style={{ color: 'white', fontWeight: 'bold' }}>
                    {selectedTicket.seats ? selectedTicket.seats.map(s => `${s.row_no}${s.seat_no}`).join(', ') : 'No seats assigned'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#777', fontSize: '0.8rem', textTransform: 'uppercase' }}>Total Paid</div>
                  <div style={{ color: 'white', fontWeight: 'bold' }}>₹{selectedTicket.total_amount}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Profile;
