import { useState, useContext, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppContext } from '../context/AppContext';

const AutonomousBot = () => {
  const { token, selectedCity } = useContext(AppContext);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Hi! Tell me what you want to watch (e.g. "Book 2 tickets for an action movie in Mumbai tonight").' }
  ]);
  const [context, setContext] = useState(null);
  
  const navigate = useNavigate();
  const chatEndRef = useRef(null);
  const chatBodyRef = useRef(null);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);

  useEffect(() => {
    if (showAiPanel && isPinnedToBottom && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showAiPanel, isPinnedToBottom]);

  const handleChatScroll = () => {
    const el = chatBodyRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setIsPinnedToBottom(distanceFromBottom < 80);
  };

  const holdSeatsForPayload = async (payload) => {
    if (!token || !payload?.show_id || !payload?.selectedSeats?.length) return { ok: true };
    const seatIds = payload.preSelectedSeatIds || payload.selectedSeats.map(s => s.seat_id);
    const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/seat-holds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ show_id: payload.show_id, seat_ids: seatIds })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data.error || 'Those seats are no longer available. Please choose another showtime.' };
    return { ok: true };
  };

  const sendRequest = async (userText, currentContext, isOption = false) => {
    setLoading(true);
    setIsPinnedToBottom(true);
    const requestHistory = [...messages, { sender: 'user', text: userText }]
      .slice(-12)
      .map(({ sender, text }) => ({ sender, text }));
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setPrompt('');

    const cityContext = selectedCity && selectedCity !== 'All'
      ? { city: selectedCity }
      : { all_cities: true };
    const mergedContext = currentContext || cityContext;

    try {
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/autonomous-agent', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ prompt: userText, context: mergedContext, isOption, history: requestHistory })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setMessages(prev => [...prev, { sender: 'bot', text: data.error || 'Failed to process request.' }]);
        setLoading(false);
        return;
      }

      if (data.type === 'clarify' || data.type === 'confirm_checkout') {
        setMessages(prev => [...prev, { 
          sender: 'bot', 
          text: data.message, 
          options: data.options 
        }]);
        setContext(data.context);
      } else if (data.type === 'waitlist') {
        setMessages(prev => [...prev, { 
          sender: 'bot', 
          text: data.message, 
          waitlistData: data.waitlistData 
        }]);
      } else if (data.type === 'error') {
        setMessages(prev => [...prev, { sender: 'bot', text: data.message }]);
      } else if (data.type === 'out_of_scope' || data.type === 'greeting') {
        setMessages(prev => [...prev, { sender: 'bot', text: data.message }]);
      } else if (data.type === 'checkout' && data.payload) {
        const holdResult = await holdSeatsForPayload(data.payload);
        if (!holdResult.ok) {
          setMessages(prev => [...prev, { sender: 'bot', text: holdResult.message }]);
          setLoading(false);
          return;
        }
        setContext(null);
        setMessages(prev => [...prev, { sender: 'bot', text: data.message || 'Great, I found seats for you. Taking you to checkout now...' }]);
        setTimeout(() => {
          setShowAiPanel(false);
          navigate('/checkout', { state: data.payload });
        }, 1000);
      }
    } catch {
      setMessages(prev => [...prev, { sender: 'bot', text: 'Network error. Please try again.' }]);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    sendRequest(prompt.trim(), context);
  };

  const handleOptionClick = (opt) => {
    sendRequest(opt, context, true);
  };

  const handleJoinWaitlist = async (waitlistData) => {
    setLoading(true);
    try {
      const res = await fetch((import.meta.env.VITE_API_URL || 'http://localhost:5000') + '/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(waitlistData)
      });
      if (res.ok) {
        setMessages(prev => [...prev, { sender: 'bot', text: 'You have been added to the waitlist! We will notify you if seats open up.' }]);
        setContext(null);
      }
    } catch {
      setMessages(prev => [...prev, { sender: 'bot', text: 'Failed to join waitlist.' }]);
    }
    setLoading(false);
  };

  const location = useLocation();
  const hideOnPaths = ['/seatlayout', '/checkout', '/buytickets'];
  if (hideOnPaths.some(p => location.pathname.toLowerCase().startsWith(p))) return null;

  return (
    <>
      <div className="ai-fab" onClick={() => setShowAiPanel(!showAiPanel)}>
        <span style={{ marginRight: '8px' }}>✨</span> Book Instantly
      </div>

      {showAiPanel && (
        <div className="ai-panel">
          <div className="ai-header">
            <span>✨ ShowsNow Concierge</span>
            <span style={{ cursor: 'pointer', fontSize: '1.2rem', padding: '0 8px' }} onClick={() => setShowAiPanel(false)}>✕</span>
          </div>
          
          <div
            ref={chatBodyRef}
            className="ai-chat-body"
            onScroll={handleChatScroll}
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              padding: '1.5rem',
              overflowY: 'auto',
              background: 'rgba(10,10,15,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              height: 'min(60vh, 430px)',
              maxHeight: 'min(60vh, 430px)'
            }}
          >
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', flexShrink: 0 }}>
                <div style={{
                  background: m.sender === 'user' ? 'linear-gradient(135deg, #c8a96e, #f84464)' : 'rgba(255,255,255,0.08)',
                  color: 'white',
                  padding: '12px 18px', borderRadius: '16px',
                  boxShadow: m.sender === 'user' ? '0 4px 15px rgba(200, 169, 110, 0.3)' : 'none', 
                  fontSize: '0.95rem', lineHeight: '1.5',
                  border: m.sender === 'bot' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                  borderBottomRightRadius: m.sender === 'user' ? '4px' : '16px',
                  borderBottomLeftRadius: m.sender === 'bot' ? '4px' : '16px',
                }}>
                  {m.text}
                </div>
                {m.options && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                    {m.options.map((opt, idx) => (
                      <button key={idx} onClick={() => handleOptionClick(opt)} disabled={loading} style={{
                        background: 'white', border: '1px solid var(--bms-red)', color: 'var(--bms-red)',
                        padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer'
                      }}>{opt}</button>
                    ))}
                  </div>
                )}
                {m.waitlistData && (
                  <div style={{ marginTop: '8px' }}>
                    <button onClick={() => handleJoinWaitlist(m.waitlistData)} disabled={loading} style={{
                      background: '#1ea83c', color: 'white', border: 'none', padding: '8px 16px',
                      borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem'
                    }}>Join Waitlist</button>
                  </div>
                )}
              </div>
            ))}
            {loading && <div style={{ alignSelf: 'flex-start', fontSize: '0.8rem', color: '#888' }}>Agent is typing...</div>}
            <div ref={chatEndRef} />
          </div>
          
          <form onSubmit={handleSubmit} style={{ padding: '1.2rem', background: 'rgba(255,255,255,0.05)', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: '12px' }}>
            <input 
              type="text" 
              value={prompt} 
              onChange={(e) => setPrompt(e.target.value)} 
              placeholder="Ask anything..." 
              disabled={loading}
              style={{ flex: 1, padding: '12px 16px', borderRadius: '30px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', outline: 'none', color: 'white', fontSize: '0.95rem' }}
            />
            <button type="submit" disabled={loading || !prompt.trim()} style={{
              background: 'linear-gradient(135deg, #c8a96e, #f84464)', color: 'white', border: 'none',
              padding: '0 24px', borderRadius: '30px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem',
              boxShadow: '0 4px 15px rgba(200, 169, 110, 0.4)', transition: 'transform 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >Send</button>
          </form>
        </div>
      )}
    </>
  );
};

export default AutonomousBot;
