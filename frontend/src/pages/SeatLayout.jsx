import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { useLocation } from 'react-router-dom';

const TIER_COLORS = { VIP: '#9b59b6', Premium: '#2980b9', Regular: '#1ea83c' };
const MAX_SEATS = 10;

const SeatLayout = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const preSelectedSeatIds = location.state?.preSelectedSeatIds || [];
  const preCartSnacks = location.state?.preCartSnacks || {};
  
  const [seats, setSeats] = useState([]);
  const [showInfo, setShowInfo] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);

  useEffect(() => {
    fetch(`http://localhost:5000/api/seats/${id}`)
      .then(r => r.json())
      .then(data => {
        setSeats(data);
        if (preSelectedSeatIds.length > 0) {
          const preSelected = data.filter(s => preSelectedSeatIds.includes(s.seat_id) && !s.is_booked);
          setSelectedSeats(preSelected);
        }
      });
    fetch(`http://localhost:5000/api/shows/${id}`).then(r => r.json()).then(setShowInfo);
  }, [id]);

  const toggleSeat = (seat) => {
    if (seat.is_booked) return;
    if (selectedSeats.find(s => s.seat_id === seat.seat_id)) {
      setSelectedSeats(selectedSeats.filter(s => s.seat_id !== seat.seat_id));
    } else {
      if (selectedSeats.length >= MAX_SEATS) { alert(`Max ${MAX_SEATS} seats per booking.`); return; }
      setSelectedSeats([...selectedSeats, seat]);
    }
  };

  const rows = seats.reduce((acc, seat) => {
    if (!acc[seat.row_no]) acc[seat.row_no] = [];
    acc[seat.row_no].push(seat);
    return acc;
  }, {});

  const tierRows = {};
  seats.forEach(seat => {
    if (!tierRows[seat.seat_type]) tierRows[seat.seat_type] = new Set();
    tierRows[seat.seat_type].add(seat.row_no);
  });

  const basePrice = showInfo ? parseFloat(showInfo.base_price) : 0;
  const surgeMultiplier = showInfo?.is_surge_active ? 1.2 : 1.0;
  const totalTicketPrice = selectedSeats.reduce((sum, s) => sum + (basePrice * parseFloat(s.price_multiplier) * surgeMultiplier), 0);
  const sortedTiers = ['VIP', 'Premium', 'Regular'].filter(t => tierRows[t]);

  const renderSeat = (seat) => {
    const isSelected = selectedSeats.some(s => s.seat_id === seat.seat_id);
    const color = TIER_COLORS[seat.seat_type] || '#1ea83c';
    return (
      <div key={seat.seat_id} onClick={() => toggleSeat(seat)}
        title={`${seat.row_no}${seat.seat_no} - ${seat.seat_type}`}
        style={{
          width: '26px', height: '26px', borderRadius: '4px 4px 0 0',
          border: seat.is_booked ? 'none' : `1px solid ${color}`,
          background: seat.is_booked ? '#e0e0e0' : isSelected ? color : 'white',
          cursor: seat.is_booked ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.6rem', color: isSelected ? 'white' : (seat.is_booked ? '#bbb' : color),
          transition: 'all 0.1s'
        }}
      >{seat.seat_no}</div>
    );
  };

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {showInfo && (
        <div style={{ background: 'white', borderBottom: '1px solid #eee', padding: '1rem 3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ cursor: 'pointer', color: '#666' }} onClick={() => navigate(-1)}>←</span>
            <img src={showInfo.poster_url} alt={showInfo.title} style={{ width: '40px', borderRadius: '4px' }} />
            <div>
              <div style={{ fontWeight: '700' }}>{showInfo.title}</div>
              <div style={{ color: '#888', fontSize: '0.8rem' }}>
                {showInfo.cinema_name} • {showInfo.screen_name} • {new Date(showInfo.show_time).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} • {new Date(showInfo.show_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
          {showInfo.is_surge_active && (
            <div style={{ background: '#fff3cd', color: '#856404', padding: '5px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 'bold' }}>⚡ Surge +20%</div>
          )}
        </div>
      )}

      <div style={{ flex: 1, padding: '2rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: selectedSeats.length > 0 ? '100px' : '2rem' }}>
        <div style={{ width: '50%', height: '8px', background: 'linear-gradient(to bottom, #d9d9d9, transparent)', borderTopLeftRadius: '50%', borderTopRightRadius: '50%', marginBottom: '0.4rem' }} />
        <div style={{ color: '#aaa', fontSize: '0.7rem', letterSpacing: '4px', marginBottom: '2.5rem' }}>ALL EYES THIS WAY PLEASE!</div>

        {sortedTiers.map(tier => {
          const tierRowNames = Array.from(tierRows[tier]).sort();
          const mult = tier === 'VIP' ? 2.0 : tier === 'Premium' ? 1.5 : 1.0;
          const tierPrice = (basePrice * mult * surgeMultiplier).toFixed(0);
          return (
            <div key={tier} style={{ marginBottom: '2.5rem', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ height: '1px', width: '80px', background: '#ddd' }} />
                <span style={{ color: TIER_COLORS[tier], fontWeight: '700', fontSize: '0.8rem' }}>{tier.toUpperCase()} — ₹{tierPrice}</span>
                <div style={{ height: '1px', width: '80px', background: '#ddd' }} />
              </div>
              {tierRowNames.map(rowName => {
                const rowSeats = rows[rowName] || [];
                const half = Math.ceil(rowSeats.length / 2);
                return (
                  <div key={rowName} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '8px' }}>
                    <div style={{ width: '18px', color: '#aaa', fontSize: '0.7rem', textAlign: 'right' }}>{rowName}</div>
                    <div style={{ display: 'flex', gap: '4px' }}>{rowSeats.slice(0, half).map(renderSeat)}</div>
                    <div style={{ width: '20px' }} />
                    <div style={{ display: 'flex', gap: '4px' }}>{rowSeats.slice(half).map(renderSeat)}</div>
                    <div style={{ width: '18px', color: '#aaa', fontSize: '0.7rem' }}>{rowName}</div>
                  </div>
                );
              })}
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: '2rem', fontSize: '0.8rem', color: '#666', marginTop: '1rem' }}>
          <span><span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1px solid #1ea83c', marginRight: '5px' }} />Available</span>
          <span><span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#1ea83c', marginRight: '5px' }} />Selected</span>
          <span><span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#e0e0e0', marginRight: '5px' }} />Sold</span>
        </div>
      </div>

      {selectedSeats.length > 0 && (
        <div style={{ background: 'white', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 -4px 12px rgba(0,0,0,0.08)', position: 'fixed', bottom: 0, width: '100%', zIndex: 100 }}>
          <div>
            <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>{selectedSeats.length} Ticket{selectedSeats.length > 1 ? 's' : ''} — ₹{totalTicketPrice.toFixed(0)}</div>
            <div style={{ fontSize: '0.8rem', color: '#888' }}>{selectedSeats.map(s => `${s.row_no}${s.seat_no}`).join(', ')}</div>
          </div>
          <button
            onClick={() => navigate('/checkout', { state: { show_id: id, selectedSeats, showInfo, totalTicketPrice, preCartSnacks } })}
            style={{ background: 'var(--bms-red)', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem' }}
          >Pay →</button>
        </div>
      )}
    </div>
  );
};

export default SeatLayout;
