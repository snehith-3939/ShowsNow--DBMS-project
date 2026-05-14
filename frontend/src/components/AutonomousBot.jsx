import { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';

const AutonomousBot = () => {
  const { token } = useContext(AppContext);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleAiSearch = (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    setLoading(true);
    setError(null);
    
    fetch('http://localhost:5000/api/autonomous-agent', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ prompt })
    })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process request');
      return data;
    })
    .then(data => {
      setLoading(false);
      setShowAiPanel(false);
      setPrompt('');
      // Teleport directly to Checkout
      navigate('/checkout', { state: data.payload });
    })
    .catch(err => {
      console.error(err);
      setError(err.message);
      setLoading(false);
    });
  };

  return (
    <>
      <div className="ai-fab" onClick={() => setShowAiPanel(!showAiPanel)}>
        ✨
      </div>

      {showAiPanel && (
        <div className="ai-panel">
          <div className="ai-header">
            <span>AI Booking Agent</span>
            <span style={{ cursor: 'pointer' }} onClick={() => setShowAiPanel(false)}>✕</span>
          </div>
          <div className="ai-body">
            <div style={{ marginBottom: '1.5rem', background: '#f5f5f5', padding: '1rem', borderRadius: '8px', fontSize: '0.9rem', color: '#333' }}>
              <strong>Hi! I am your autonomous agent.</strong><br/>
              Tell me what you want, and I will find the best show, pick your seats, bundle your snacks, and take you straight to checkout.<br/><br/>
              <em>Try: "Book me 2 tickets for an action movie in Mumbai tonight at 6 PM with popcorn."</em>
            </div>
            
            <form onSubmit={handleAiSearch}>
              <textarea 
                className="ai-input" 
                value={prompt} 
                onChange={(e) => setPrompt(e.target.value)} 
                placeholder="Type your command here..." 
                rows="4"
                style={{ resize: 'none' }}
                disabled={loading}
              />
              {error && <div style={{ color: 'var(--bms-red)', fontSize: '0.8rem', marginBottom: '10px' }}>{error}</div>}
              <button type="submit" className="ai-btn" disabled={loading}>
                {loading ? 'Processing Command & Booking Seats...' : 'Auto-Book For Me'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default AutonomousBot;
