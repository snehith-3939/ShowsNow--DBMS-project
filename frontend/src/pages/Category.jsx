import { useState, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import { AppContext } from '../context/AppContext';

// High-Fidelity Mock Engine for Categories without public APIs
const MOCK_DATA = {
  events: [
    { id: 1, title: 'Sunburn Arena ft. Alan Walker', genre: 'Music Concert', price: '₹1500', date: 'Sat, 15 Oct', image: 'https://images.unsplash.com/photo-1540039155732-6762b5134f5b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80', venue: 'Bandra Kurla Complex' },
    { id: 2, title: 'Kanan Gill - Experience', genre: 'Standup Comedy', price: '₹799', date: 'Sun, 16 Oct', image: 'https://images.unsplash.com/photo-1585699324551-f6c309eedeca?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80', venue: 'St. Andrews Auditorium' },
    { id: 3, title: 'NH7 Weekender', genre: 'Music Festival', price: '₹2500', date: 'Fri, 28 Oct', image: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80', venue: 'Mahalaxmi Race Course' },
  ],
  sports: [
    { id: 4, title: 'India vs Australia - T20', genre: 'Cricket', price: '₹1200', date: 'Sun, 23 Oct', image: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80', venue: 'Wankhede Stadium' },
    { id: 5, title: 'Pro Kabaddi League', genre: 'Kabaddi', price: '₹500', date: 'Wed, 12 Oct', image: 'https://images.unsplash.com/photo-1584955745423-f3844f2d348a?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80', venue: 'NSCI Dome' },
  ],
  plays: [
    { id: 6, title: 'Mughal-e-Azam', genre: 'Theatre Play', price: '₹1000', date: 'Sat, 05 Nov', image: 'https://images.unsplash.com/photo-1507676184212-d0330a15673c?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80', venue: 'NCPA' },
    { id: 7, title: 'Hamlet by Royal Shakespeare', genre: 'Classic Drama', price: '₹1500', date: 'Sun, 06 Nov', image: 'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80', venue: 'Prithvi Theatre' },
  ],
  activities: [
    { id: 8, title: 'Imagicaa Theme Park', genre: 'Amusement Park', price: '₹1299', date: 'Open Daily', image: 'https://images.unsplash.com/photo-1513889961551-628c1e5e2ee9?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80', venue: 'Khopoli' },
    { id: 9, title: 'Midnight Cycling Tour', genre: 'Adventure', price: '₹499', date: 'Sat, 15 Oct', image: 'https://images.unsplash.com/photo-1534151740924-f761fc726e63?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80', venue: 'Colaba Causeway' },
  ]
};

const Category = () => {
  const { name } = useParams();
  const { selectedCity } = useContext(AppContext);
  const [data, setData] = useState([]);

  useEffect(() => {
    // Generate realistic data based on category
    const categoryKey = name.toLowerCase();
    let events = MOCK_DATA[categoryKey] || [];
    
    // Create slightly different events based on the city to make it feel real-time and dynamic
    if (events.length > 0) {
      events = events.map(e => ({
        ...e,
        venue: `${e.venue}, ${selectedCity}`,
        // Randomize price slightly based on city
        price: `₹${parseInt(e.price.replace('₹', '')) + (selectedCity === 'Mumbai' ? 200 : 0)}`
      }));
    }
    
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(events);
  }, [name, selectedCity]);

  if (data.length === 0) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', minHeight: '80vh', background: '#f5f5f5' }}>
        <h1 style={{ fontSize: '3rem', color: '#333545', textTransform: 'capitalize', marginBottom: '1rem' }}>
          {name}
        </h1>
        <p style={{ fontSize: '1.2rem', color: '#666', maxWidth: '600px', margin: '0 auto 2rem auto' }}>
          We are currently gathering the best {name} experiences in {selectedCity}. Check back soon!
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', paddingBottom: '4rem' }}>
      <div style={{ background: '#333545', color: 'white', padding: '3rem 4rem', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2.5rem', textTransform: 'capitalize', marginBottom: '1rem' }}>Best {name} in {selectedCity}</h1>
        <p style={{ color: '#aaa', fontSize: '1.1rem' }}>Discover the most happening {name.toLowerCase()} in your city.</p>
      </div>

      <div className="main-container">
        <div className="movie-grid">
          {data.map(item => (
            <div key={item.id} className="movie-card" style={{ cursor: 'pointer' }} onClick={() => alert(`Booking flow for ${item.title} coming soon!`)}>
              <div style={{ position: 'relative' }}>
                <img src={item.image} alt={item.title} className="poster" />
                <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(0,0,0,0.8)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                  {item.date}
                </div>
              </div>
              <div style={{ paddingTop: '0.8rem' }}>
                <div className="movie-title">{item.title}</div>
                <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '4px' }}>{item.venue}</div>
                <div style={{ color: '#888', fontSize: '0.8rem', marginBottom: '8px' }}>{item.genre}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', color: '#333' }}>{item.price} onwards</span>
                  <button style={{ background: 'var(--bms-red)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}>
                    Book
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Category;
