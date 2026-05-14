import { Link } from 'react-router-dom';

const Footer = () => {
  const links = {
    'Movies & Events': ['Movies', 'Stream', 'Events', 'Plays', 'Sports', 'Activities'],
    'Help & Support': ['About Us', 'Contact Us', 'FAQs', 'Careers'],
    'Explore': ['Gift Cards', 'Offers', 'Corporates', 'Blog'],
    'Download App': ['iOS App', 'Android App'],
  };

  return (
    <footer style={{ background: '#1a1a2e', color: '#aaa', marginTop: '3rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 2rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2rem' }}>
        {Object.entries(links).map(([section, items]) => (
          <div key={section}>
            <h4 style={{ color: 'white', marginBottom: '1rem', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{section}</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {items.map(item => (
                <li key={item} style={{ marginBottom: '8px' }}>
                  <a href="#" style={{ color: '#aaa', textDecoration: 'none', fontSize: '0.85rem', transition: 'color 0.2s' }}
                    onMouseEnter={e => e.target.style.color = 'var(--bms-red)'}
                    onMouseLeave={e => e.target.style.color = '#aaa'}
                  >{item}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ fontSize: '0.8rem' }}>© 2025 ShowsNow — DBMS Project. Built with PostgreSQL, React & Node.js.</div>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '1.2rem' }}>
          {['𝕏', '📘', '📸', '▶️'].map((icon, i) => (
            <span key={i} style={{ cursor: 'pointer', opacity: 0.6 }} onMouseEnter={e => e.target.style.opacity = 1} onMouseLeave={e => e.target.style.opacity = 0.6}>{icon}</span>
          ))}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
