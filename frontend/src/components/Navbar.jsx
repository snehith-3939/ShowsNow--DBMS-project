import { useContext, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';

const Navbar = () => {
  const { selectedCity, setSelectedCity, user, login, logout, register, searchQuery, setSearchQuery } = useContext(AppContext);
  const navigate = useNavigate();

  // Modal States
  const [showCityModal, setShowCityModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  // Auth form state
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'register'
  const [formData, setFormData] = useState({ name: '', email: '', password: '', phone: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const cities = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chandigarh', 'Pune', 'Kolkata', 'Chennai', 'All'];

  const handleCitySelect = (city) => {
    setSelectedCity(city);
    setShowCityModal(false);
    navigate('/');
  };

  const openAuthModal = (tab = 'login') => {
    setAuthTab(tab);
    setFormData({ name: '', email: '', password: '', phone: '' });
    setAuthError('');
    setShowAuthModal(true);
  };

  // Listen for checkout's "open auth modal" event
  useEffect(() => {
    const handler = () => openAuthModal('login');
    window.addEventListener('bms:open-auth', handler);
    return () => window.removeEventListener('bms:open-auth', handler);
  }, []);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    let result;
    if (authTab === 'login') {
      result = await login(formData.email, formData.password);
    } else {
      result = await register(formData.name, formData.email, formData.password, formData.phone || undefined);
    }

    setAuthLoading(false);

    if (result.success) {
      setShowAuthModal(false);
    } else {
      setAuthError(result.error);
    }
  };

  const handleChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const categoriesLeft = ['Movies', 'Stream', 'Events', 'Plays', 'Sports', 'Activities'];
  const categoriesRight = ['ListYourShow', 'Corporates', 'Offers', 'Gift Cards'];

  const inputStyle = {
    width: '100%',
    padding: '11px 14px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    marginBottom: '12px',
    outline: 'none',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
    transition: 'border 0.2s',
  };

  return (
    <>
      <nav className="navbar">
        <div className="nav-left">
          <Link to="/" style={{ textDecoration: 'none' }}>
            <div className="logo">shows<span>now</span></div>
          </Link>
          <div className="search-bar">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search for Movies, Events, Plays, Sports and Activities"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="nav-right">
          <div className="city-select" onClick={() => setShowCityModal(true)}>
            {selectedCity} ▾
          </div>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <span 
                onClick={() => navigate('/profile')}
                style={{ color: 'white', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' }}
              >
                Hi, {user.name.split(' ')[0]}
              </span>
              {user.role === 'admin' && (
                <button 
                  className="btn-signin" 
                  onClick={() => navigate('/admin')}
                  style={{ background: 'white', color: 'var(--bms-red)', border: 'none', height: '32px', padding: '0 15px' }}
                >
                  Admin Panel
                </button>
              )}
              <button
                onClick={() => { logout(); setShowDrawer(false); }}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.4)', color: 'white', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button className="btn-signin" onClick={() => openAuthModal('login')}>Sign in</button>
          )}

          <div style={{ color: 'white', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => setShowDrawer(true)}>☰</div>
        </div>
      </nav>

      <div className="sub-nav">
        <div className="sub-nav-links">
          {categoriesLeft.map(cat => {
            let path = `/category/${cat.toLowerCase()}`;
            if (cat === 'Movies') path = '/';
            if (cat === 'Stream') path = '/stream';
            return <Link key={cat} to={path}>{cat}</Link>;
          })}
        </div>
        <div className="sub-nav-links">
          {categoriesRight.map(cat => (
            <Link key={cat} to={`/category/${cat.toLowerCase().replace(/\s/g, '')}`}>{cat}</Link>
          ))}
        </div>
      </div>

      {/* City Modal */}
      {showCityModal && (
        <div className="modal-overlay" onClick={() => setShowCityModal(false)}>
          <div className="modal-content city-modal" onClick={e => e.stopPropagation()}>
             <h3 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>Popular Cities</h3>
             <div className="city-grid">
               {cities.map(city => (
                 <div
                   key={city}
                   className={`city-item ${selectedCity === city ? 'active' : ''}`}
                   onClick={() => handleCitySelect(city)}
                 >
                   {city}
                 </div>
               ))}
             </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="modal-content auth-modal" onClick={e => e.stopPropagation()} style={{ width: '400px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>{authTab === 'login' ? 'Welcome Back' : 'Create Account'}</h3>
              <span style={{ cursor: 'pointer', color: '#999', fontSize: '1.2rem' }} onClick={() => setShowAuthModal(false)}>✕</span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', marginBottom: '1.5rem', borderBottom: '2px solid #eee' }}>
              {[['login', 'Login'], ['register', 'Register']].map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => { setAuthTab(tab); setAuthError(''); }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    border: 'none',
                    background: 'transparent',
                    borderBottom: authTab === tab ? '2px solid var(--bms-red)' : '2px solid transparent',
                    color: authTab === tab ? 'var(--bms-red)' : '#666',
                    fontWeight: authTab === tab ? '700' : '400',
                    cursor: 'pointer',
                    fontSize: '0.95rem',
                    marginBottom: '-2px',
                    transition: 'all 0.2s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <form onSubmit={handleAuthSubmit}>
              {authTab === 'register' && (
                <input
                  type="text"
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={handleChange('name')}
                  required
                  style={inputStyle}
                />
              )}
              <input
                type="email"
                placeholder="Email Address"
                value={formData.email}
                onChange={handleChange('email')}
                required
                style={inputStyle}
              />
              <input
                type="password"
                placeholder={authTab === 'register' ? 'Create Password (min. 6 chars)' : 'Password'}
                value={formData.password}
                onChange={handleChange('password')}
                required
                style={inputStyle}
              />
              {authTab === 'register' && (
                <input
                  type="tel"
                  placeholder="Phone Number (optional)"
                  value={formData.phone}
                  onChange={handleChange('phone')}
                  style={inputStyle}
                />
              )}

              {authError && (
                <div style={{ background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px', color: '#cc0000', fontSize: '0.85rem' }}>
                  ⚠️ {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                style={{
                  width: '100%',
                  padding: '13px',
                  background: authLoading ? '#ccc' : 'var(--bms-red)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  fontSize: '1rem',
                  cursor: authLoading ? 'wait' : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {authLoading
                  ? '⏳ Please wait...'
                  : authTab === 'login' ? 'Login' : 'Create Account'}
              </button>
            </form>

            <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '1rem', textAlign: 'center' }}>
              {authTab === 'login'
                ? <>Don't have an account? <span style={{ color: 'var(--bms-red)', cursor: 'pointer', fontWeight: '600' }} onClick={() => { setAuthTab('register'); setAuthError(''); }}>Register</span></>
                : <>Already have an account? <span style={{ color: 'var(--bms-red)', cursor: 'pointer', fontWeight: '600' }} onClick={() => { setAuthTab('login'); setAuthError(''); }}>Login</span></>
              }
            </p>
            <p style={{ fontSize: '0.72rem', color: '#aaa', textAlign: 'center', marginTop: '8px' }}>
              By continuing, I agree to the Terms & Conditions & Privacy Policy.
            </p>
          </div>
        </div>
      )}

      {/* Side Drawer */}
      {showDrawer && (
        <>
          <div className="drawer-overlay" onClick={() => setShowDrawer(false)}></div>
          <div className="side-drawer">
            <div className="drawer-header">
              <h3>{user ? `Hey, ${user.name.split(' ')[0]}!` : 'Hey!'}</h3>
              <span style={{ cursor: 'pointer' }} onClick={() => setShowDrawer(false)}>✕</span>
            </div>
            <div className="drawer-body">
              {user ? (
                <>
                  <div style={{ padding: '12px 0', fontSize: '0.8rem', color: '#888', borderBottom: '1px solid #f0f0f0', marginBottom: '8px' }}>
                    {user.email}
                    {user.loyalty_points > 0 && (
                      <span style={{ marginLeft: '8px', background: '#fff3cd', color: '#856404', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>
                        🏆 {user.loyalty_points} pts
                      </span>
                    )}
                  </div>
                  <div className="drawer-item" onClick={() => { navigate('/profile'); setShowDrawer(false); }}>👤 My Profile & Bookings</div>
                  <div className="drawer-item" onClick={() => { navigate('/waitlist'); setShowDrawer(false); }}>🕒 Your Waitlists</div>
                  {user.role === 'admin' && (
                    <div 
                      className="drawer-item" 
                      onClick={() => { navigate('/admin'); setShowDrawer(false); }}
                      style={{ color: 'var(--bms-red)', fontWeight: '700' }}
                    >
                      🛡️ Admin Dashboard
                    </div>
                  )}
                  <div className="drawer-item" onClick={() => { logout(); setShowDrawer(false); }} style={{ color: 'var(--bms-red)' }}>🚪 Sign Out</div>
                </>
              ) : (
                <>
                  <div className="drawer-item" onClick={() => { setShowDrawer(false); openAuthModal('login'); }}>🔒 Login</div>
                  <div className="drawer-item" onClick={() => { setShowDrawer(false); openAuthModal('register'); }}>✨ Create Account</div>
                </>
              )}
              <hr style={{ margin: '1rem 0', borderTop: '1px solid #eee' }} />
              <div className="drawer-item">🎧 Help & Support</div>
              <div className="drawer-item">🎁 Rewards</div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default Navbar;
