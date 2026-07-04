import { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { AppContext } from '../context/AppContext';
import { CheckCircle2 } from 'lucide-react';

const CONVENIENCE_FEE = 30;
const TAX_RATE = 0.18;

const PaymentModal = ({ total, onSuccess, onClose }) => {
  const [tab, setTab] = useState('upi');
  const [upiId, setUpiId] = useState('');
  const [cardNum, setCardNum] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [processing, setProcessing] = useState(false);

  const handlePay = async (e) => {
    e.preventDefault();
    setProcessing(true);
    await new Promise(r => setTimeout(r, 1800)); // simulate gateway
    setProcessing(false);
    onSuccess(tab);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--card-bg)', width: '440px', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ background: '#333545', color: 'white', padding: '1.2rem 1.5rem', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: '700' }}>Complete Payment — ₹{total.toFixed(2)}</span>
          <span onClick={onClose} style={{ cursor: 'pointer', opacity: 0.7 }}>✕</span>
        </div>
        {/* Payment Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #eee' }}>
          {[['upi', 'UPI'], ['card', 'Card'], ['netbanking', 'NetBanking']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ flex: 1, padding: '12px', border: 'none', background: tab === key ? 'rgba(200, 169, 110, 0.1)' : 'transparent', borderBottom: tab === key ? '2px solid var(--bms-red)' : '2px solid transparent', color: tab === key ? 'var(--bms-red)' : 'var(--bms-muted)', fontWeight: tab === key ? '700' : '400', cursor: 'pointer', fontSize: '0.8rem' }}
            >{label}</button>
          ))}
        </div>
        <form onSubmit={handlePay} style={{ padding: '1.5rem' }}>
          {tab === 'upi' && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: 'var(--bms-text)' }}>Enter UPI ID</label>
              <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="yourname@upi"
                required style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px', marginBottom: '1rem', outline: 'none', fontSize: '1rem' }} />
              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--bms-muted)', marginBottom: '1rem' }}>
                You will receive a payment request on your UPI app.
              </div>
            </div>
          )}
          {tab === 'card' && (
            <div>
              <input value={cardNum} onChange={e => setCardNum(e.target.value)} placeholder="Card Number" required
                style={{ width: '100%', padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px', marginBottom: '10px', outline: 'none' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <input value={cardExpiry} onChange={e => setCardExpiry(e.target.value)} placeholder="MM/YY" required
                  style={{ flex: 1, padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px', outline: 'none' }} />
                <input value={cardCvv} onChange={e => setCardCvv(e.target.value)} placeholder="CVV" required
                  style={{ flex: 1, padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '6px', outline: 'none' }} />
              </div>
            </div>
          )}
          {tab === 'netbanking' && (
            <div>
              <label style={{ fontWeight: '500', display: 'block', marginBottom: '8px', color: 'var(--bms-text)' }}>Select Bank</label>
              {['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak'].map(bank => (
                <label key={bank} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', color: 'white', borderRadius: '6px', marginBottom: '8px', cursor: 'pointer' }}>
                  <input type="radio" name="bank" value={bank} required /> {bank} Bank
                </label>
              ))}
            </div>
          )}
          <button type="submit" disabled={processing}
            style={{ width: '100%', marginTop: '1rem', padding: '14px', background: processing ? '#ccc' : 'var(--bms-red)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.1rem', cursor: processing ? 'wait' : 'pointer' }}>
            {processing ? 'Processing...' : `Pay ₹${total.toFixed(2)}`}
          </button>
        </form>
      </div>
    </div>
  );
};

const Checkout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, token } = useContext(AppContext);
  const state = location.state || {};
  const { show_id, selectedSeats = [], showInfo, totalTicketPrice = 0, preCartSnacks = {} } = state;

  const [snacks, setSnacks] = useState([]);
  const [cartSnacks, setCartSnacks] = useState(preCartSnacks);
  const [showPayment, setShowPayment] = useState(false);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [bookingError, setBookingError] = useState('');
  
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [applyPoints, setApplyPoints] = useState(false);

  useEffect(() => {
    if (!show_id) {
      navigate('/');
      return;
    }
    fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/snacks').then(r => r.json()).then(setSnacks);
    
    if (user && token) {
      fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/user/loyalty', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(r => r.json())
      .then(data => setLoyaltyBalance(data.balance || 0))
      .catch(() => {});
    }
  }, [navigate, show_id, user, token]);

  const addSnack = id => setCartSnacks(p => ({ ...p, [id]: (p[id] || 0) + 1 }));
  const removeSnack = id => setCartSnacks(p => {
    const q = (p[id] || 0) - 1;
    if (q <= 0) { const n = { ...p }; delete n[id]; return n; }
    return { ...p, [id]: q };
  });

  const snacksTotal = Object.keys(cartSnacks).reduce((sum, id) => {
    const s = snacks.find(x => x.snack_id === id);
    return sum + (s ? parseFloat(s.price) * cartSnacks[id] : 0);
  }, 0);

  let subtotal = totalTicketPrice + snacksTotal;
  
  let pointsDiscount = 0;
  if (applyPoints && loyaltyBalance > 0) {
    const POINTS_MULTIPLIER = 0.10;
    const MAX_DISCOUNT_RUPEES = 100;
    let maxPossibleDiscount = loyaltyBalance * POINTS_MULTIPLIER;
    pointsDiscount = Math.min(maxPossibleDiscount, MAX_DISCOUNT_RUPEES, subtotal);
    subtotal -= pointsDiscount;
  }

  const convenienceFee = CONVENIENCE_FEE * (selectedSeats.length || 1);
  const tax = (subtotal + convenienceFee) * TAX_RATE;
  const grandTotal = subtotal + convenienceFee + tax;

  const handlePayClick = () => {
    if (!user) { setShowAuthPrompt(true); return; }
    setShowPayment(true);
  };

  const handlePaymentSuccess = async (method = 'upi') => {
    setShowPayment(false);
    setBookingError('');
    const snackArray = Object.keys(cartSnacks).map(id => ({ id, quantity: cartSnacks[id] }));
    const paymentMethod = { upi: 'UPI', card: 'Card', netbanking: 'NetBanking' }[method] || 'Demo';
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          show_id, seat_ids: selectedSeats.map(s => s.seat_id), snack_ids: snackArray, applyPoints, payment_method: paymentMethod
        })
      });
      const result = await res.json();
      if (res.ok) {
        setBookingId(result.booking_id);
        setBookingSuccess(result);
      } else {
        setBookingError(result.error || 'Booking failed. Please try again.');
      }
    } catch (err) { setBookingError('Network error: ' + err.message); }
  };

  if (bookingSuccess) {
    const qrData = JSON.stringify({ bookingId, seats: selectedSeats.map(s => `${s.row_no}${s.seat_no}`), movie: showInfo?.title, cinema: showInfo?.cinema_name });
    return (
      <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--bms-dark)', minHeight: '100vh', color: 'white' }}>
        <div style={{ background: '#1a1c23', padding: '3rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <CheckCircle2 size={64} color="#1ea83c" strokeWidth={1.5} />
          </div>
          <h2 style={{ color: '#1ea83c', marginBottom: '0.5rem' }}>Booking Confirmed!</h2>
          <p style={{ color: 'var(--bms-muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>Show this QR code at the theatre entrance.</p>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
            <QRCodeSVG value={qrData} size={180} bgColor="#fff" fgColor="#333545" level="H" includeMargin />
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '8px', textAlign: 'left', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
            {showInfo && <div style={{ marginBottom: '8px' }}><strong>Movie:</strong> <span style={{color: 'var(--bms-muted)'}}>{showInfo.title}</span></div>}
            {showInfo && <div style={{ marginBottom: '8px' }}><strong>Cinema:</strong> <span style={{color: 'var(--bms-muted)'}}>{showInfo.cinema_name}</span></div>}
            {showInfo && <div style={{ marginBottom: '8px' }}><strong>🕐 Time:</strong> <span style={{color: 'var(--bms-muted)'}}>{new Date(showInfo.show_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>}
            <div style={{ marginBottom: '8px' }}><strong>💺 Seats:</strong> <span style={{color: 'var(--bms-muted)'}}>{selectedSeats.map(s => `${s.row_no}${s.seat_no}`).join(', ')}</span></div>
            <div style={{ marginBottom: '8px' }}><strong>Total Paid:</strong> <span style={{color: 'var(--bms-muted)'}}>₹{grandTotal.toFixed(2)}</span></div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', marginTop: '10px' }}>Booking ID: {bookingId}</div>
          </div>
          <button onClick={() => navigate('/')} style={{ background: 'var(--bms-red)', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>← Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem 4rem', background: 'var(--bms-dark)', minHeight: '100vh', display: 'flex', gap: '2rem', color: 'white' }}>
      {/* Left Column */}
      <div style={{ flex: 2 }}>
        {/* Show Info Banner */}
        {showInfo && (
          <div style={{ background: '#333545', color: 'white', padding: '1.2rem 1.5rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <img src={showInfo.poster_url} alt={showInfo.title} style={{ width: '50px', borderRadius: '4px' }} />
            <div>
              <div style={{ fontWeight: '700', fontSize: '1rem' }}>{showInfo.title}</div>
              <div style={{ opacity: 0.7, fontSize: '0.8rem', marginTop: '4px' }}>
                {showInfo.cinema_name} • {showInfo.screen_name} • {new Date(showInfo.show_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
              <div style={{ opacity: 0.8, fontSize: '0.8rem', marginTop: '4px' }}>
                Seats: {selectedSeats.map(s => `${s.row_no}${s.seat_no}`).join(', ')}
              </div>
            </div>
          </div>
        )}

        {/* Snacks */}
        <div style={{ background: 'var(--card-bg)', padding: '1.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
          <h2 style={{ marginBottom: '0.4rem' }}>🍿 Grab a Bite!</h2>
          <p style={{ color: 'var(--bms-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>Prebook your meal and skip the queue!</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {snacks.map(snack => (
              <div key={snack.snack_id} style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: '600', color: 'white' }}>{snack.name}</div>
                  <div style={{ color: 'var(--bms-muted)', fontSize: '0.85rem' }}>₹{parseFloat(snack.price).toFixed(2)}</div>
                  {snack.description && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginTop: '2px' }}>{snack.description}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {cartSnacks[snack.snack_id] ? (
                    <>
                      <button onClick={() => removeSnack(snack.snack_id)} style={{ width: '28px', height: '28px', border: '1px solid var(--bms-red)', color: 'var(--bms-red)', background: 'transparent', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>−</button>
                      <span style={{ minWidth: '16px', textAlign: 'center', fontWeight: 'bold' }}>{cartSnacks[snack.snack_id]}</span>
                      <button onClick={() => addSnack(snack.snack_id)} style={{ width: '28px', height: '28px', background: 'var(--bms-red)', color: '#0A0A0A', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>+</button>
                    </>
                  ) : (
                    <button onClick={() => addSnack(snack.snack_id)} style={{ padding: '6px 14px', border: '1px solid var(--bms-red)', color: 'var(--bms-red)', background: 'transparent', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}>Add</button>
                  )}
                </div>
              </div>
            ))}
            {snacks.length === 0 && <p style={{ color: '#aaa', gridColumn: '1/-1' }}>No snacks available. Run seed.sql to add snacks!</p>}
          </div>
        </div>
      </div>

      {/* Right Column — Booking Summary */}
      <div style={{ flex: 1 }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', position: 'sticky', top: '90px' }}>
          <h2 style={{ marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem', color: 'white' }}>Booking Summary</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--bms-muted)' }}>{selectedSeats.length} × Ticket(s)</span>
              <span style={{ color: 'white' }}>₹{totalTicketPrice.toFixed(2)}</span>
            </div>
            {snacksTotal > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--bms-muted)' }}>Food & Beverages</span>
                <span style={{ color: 'white' }}>₹{snacksTotal.toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
              <span>Convenience Fee</span>
              <span>₹{convenienceFee.toFixed(2)}</span>
            </div>
            
            {user && loyaltyBalance > 0 && (
              <div style={{ background: 'rgba(200, 169, 110, 0.1)', padding: '12px', borderRadius: '6px', marginTop: '8px', border: '1px solid rgba(200, 169, 110, 0.3)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: '600', color: 'white' }}>
                  <input type="checkbox" checked={applyPoints} onChange={(e) => setApplyPoints(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--bms-red)' }} />
                  Apply Loyalty Points
                </label>
                <div style={{ fontSize: '0.8rem', color: 'var(--bms-muted)', marginTop: '4px', paddingLeft: '24px' }}>
                  You have <strong style={{color: 'var(--bms-red)'}}>{loyaltyBalance}</strong> points. Value: up to ₹{Math.min(loyaltyBalance * 0.10, 100, totalTicketPrice + snacksTotal).toFixed(2)} off.
                </div>
              </div>
            )}

            {pointsDiscount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#1ea83c', fontWeight: 'bold' }}>
                <span>Loyalty Discount applied</span>
                <span>- ₹{pointsDiscount.toFixed(2)}</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
              <span>GST (18%)</span>
              <span>₹{tax.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1.2rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px', color: 'white' }}>
              <span>Total</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {!user && (
            <div style={{ background: 'rgba(200, 169, 110, 0.1)', border: '1px solid var(--bms-red)', borderRadius: '6px', padding: '10px', fontSize: '0.8rem', color: 'var(--bms-red)', marginBottom: '1rem' }}>
              You must be logged in to complete the booking.
            </div>
          )}

          <button onClick={handlePayClick}
            style={{ width: '100%', padding: '15px', background: 'var(--bms-red)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer' }}>
            {user ? `Pay ₹${grandTotal.toFixed(2)}` : 'Login & Pay'}
          </button>
        </div>
      </div>

      {/* Auth Prompt Modal — shown when user tries to pay without logging in */}
      {showAuthPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid rgba(255,255,255,0.1)', padding: '2rem', borderRadius: '12px', width: '380px', textAlign: 'center', color: 'white' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem', height: '2.5rem' }}></div>
            <h3 style={{ marginBottom: '0.5rem' }}>Login Required</h3>
            <p style={{ color: 'var(--bms-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              You need to be logged in to complete your booking.
            </p>
            <button
              onClick={() => { setShowAuthPrompt(false); }}
              style={{ padding: '10px 24px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', marginRight: '10px' }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowAuthPrompt(false);
                // Trigger the Navbar auth modal by dispatching a custom event
                window.dispatchEvent(new CustomEvent('bms:open-auth'));
              }}
              style={{ padding: '10px 24px', background: 'var(--bms-red)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
            >
              Login / Register
            </button>
            <p style={{ color: '#aaa', fontSize: '0.75rem', marginTop: '1rem' }}>Use the Sign in button in the top navbar to continue.</p>
          </div>
        </div>
      )}

      {bookingError && (
        <div style={{ position: 'fixed', bottom: '120px', left: '50%', transform: 'translateX(-50%)', background: '#cc0000', color: 'white', padding: '12px 24px', borderRadius: '8px', zIndex: 3000, fontWeight: '600', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          {bookingError}
          <span onClick={() => setBookingError('')} style={{ marginLeft: '12px', cursor: 'pointer', opacity: 0.8 }}>✕</span>
        </div>
      )}

      {showPayment && (
        <PaymentModal total={grandTotal} onSuccess={handlePaymentSuccess} onClose={() => setShowPayment(false)} />
      )}
    </div>
  );
};

export default Checkout;
