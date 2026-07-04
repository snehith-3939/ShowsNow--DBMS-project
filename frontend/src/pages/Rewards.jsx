import { useContext, useState, useEffect } from 'react';
import { AppContext } from '../context/AppContext';
import { useNavigate } from 'react-router-dom';
import { Droplet, Coffee, Popcorn, CupSoda, Ticket, Crown } from 'lucide-react';

const Rewards = () => {
  const { user } = useContext(AppContext);
  const navigate = useNavigate();
  const [points, setPoints] = useState(0);

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('bms_token');
      if (token) {
        fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/user/loyalty', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(res => res.json())
        .then(data => setPoints(data.balance || 0))
        .catch(console.error);
      }
    }
  }, [user]);
  
  let tier = 'Bronze';
  let nextTier = 'Silver';
  let progress = (points / 500) * 100;
  
  if (points >= 2000) {
    tier = 'Platinum';
    nextTier = 'Max Tier';
    progress = 100;
  } else if (points >= 1000) {
    tier = 'Gold';
    nextTier = 'Platinum';
    progress = ((points - 1000) / 1000) * 100;
  } else if (points >= 500) {
    tier = 'Silver';
    nextTier = 'Gold';
    progress = ((points - 500) / 500) * 100;
  }

  const rewards = [
    { title: "Free Bottled Water", points: 100, icon: <Droplet size={48} strokeWidth={1.5} color="#4fc3f7" /> },
    { title: "Free Cold Coffee", points: 300, icon: <Coffee size={48} strokeWidth={1.5} color="#d4a373" /> },
    { title: "Free Medium Popcorn", points: 500, icon: <Popcorn size={48} strokeWidth={1.5} color="#ffd166" /> },
    { title: "Free Combo (Popcorn + Coke)", points: 800, icon: <CupSoda size={48} strokeWidth={1.5} color="#ef476f" /> },
    { title: "Free 2D Movie Ticket", points: 1500, icon: <Ticket size={48} strokeWidth={1.5} color="#06d6a0" /> },
    { title: "Free VIP Recliner Ticket", points: 2500, icon: <Crown size={48} strokeWidth={1.5} color="#ffd700" /> },
  ];

  if (!user) {
    return (
      <div style={{ minHeight: 'calc(100vh - 70px)', background: '#111217', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', background: '#1a1c23', padding: '3rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', height: '3rem' }}></div>
          <h2 style={{ marginBottom: '1rem' }}>Login to view Rewards</h2>
          <p style={{ color: '#aaa', marginBottom: '2rem' }}>You need to be logged in to see your loyalty points and redeem rewards.</p>
          <button 
            onClick={() => window.dispatchEvent(new Event('bms:open-auth'))}
            style={{ background: 'var(--bms-red)', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Sign In Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 70px)', background: '#111217', color: 'white', padding: '4rem 2rem' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Header Section */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '3rem' }}>
          <div>
            <h1 style={{ fontSize: '3rem', marginBottom: '0.5rem', background: 'linear-gradient(45deg, #FFD700, #FFA500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              ShowsNow Rewards
            </h1>
            <p style={{ color: '#aaa', fontSize: '1.1rem' }}>Earn points on every booking and unlock premium cinematic experiences.</p>
          </div>
          <div style={{ background: '#1a1c23', padding: '1.5rem 2rem', borderRadius: '12px', border: '1px solid rgba(255,215,0,0.2)', textAlign: 'center' }}>
            <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>Your Points Balance</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#FFD700' }}>{points} <span style={{ fontSize: '1.2rem', color: '#888' }}>pts</span></div>
          </div>
        </div>

        {/* Tier Progress */}
        <div style={{ background: '#1a1c23', padding: '2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '4rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.9rem', color: '#888' }}>Current Tier</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: tier === 'Platinum' ? '#e5e4e2' : tier === 'Gold' ? '#FFD700' : tier === 'Silver' ? '#C0C0C0' : '#cd7f32' }}>{tier} Member</div>
            </div>
            {tier !== 'Platinum' && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.9rem', color: '#888' }}>Next Tier</div>
                <div style={{ fontSize: '1.1rem', fontWeight: '600', color: '#aaa' }}>{nextTier}</div>
              </div>
            )}
          </div>
          
          <div style={{ height: '8px', background: '#333', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(progress, 100)}%`, background: 'linear-gradient(90deg, #c084fc, #ff6b6b)', borderRadius: '4px', transition: 'width 1s ease-out' }}></div>
          </div>
          {tier !== 'Platinum' && (
            <div style={{ textAlign: 'right', marginTop: '8px', fontSize: '0.85rem', color: '#888' }}>
              Keep booking to reach {nextTier}!
            </div>
          )}
        </div>

        {/* Rewards Catalog */}
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>Rewards Catalog</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {rewards.map((reward, idx) => {
            const canAfford = points >= reward.points;
            return (
              <div key={idx} style={{ background: '#1a1c23', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', width: '80px', height: '80px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.05)' }}>
                  {reward.icon}
                </div>
                <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'white' }}>{reward.title}</h3>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: canAfford ? '#FFD700' : '#666', marginBottom: '1.5rem' }}>
                  {reward.points} pts
                </div>
                <button 
                  disabled={!canAfford}
                  style={{ width: '100%', padding: '12px', background: canAfford ? 'transparent' : '#333', border: canAfford ? '1px solid #FFD700' : 'none', color: canAfford ? '#FFD700' : '#666', borderRadius: '6px', fontWeight: 'bold', cursor: canAfford ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
                  onMouseEnter={e => { if(canAfford) { e.target.style.background = 'rgba(255,215,0,0.1)' } }}
                  onMouseLeave={e => { if(canAfford) { e.target.style.background = 'transparent' } }}
                >
                  {canAfford ? 'Redeem Now' : 'Not Enough Points'}
                </button>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};

export default Rewards;
