import { useState, useContext, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppContext } from '../context/AppContext';

const AutonomousBot = () => {
  const { token, selectedCity } = useContext(AppContext);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Hi! Tell me what you want to watch — like "2 horror tickets in Hyderabad tonight" — and I\'ll handle the rest.' }
  ]);
  const [context, setContext] = useState(null);

  const navigate = useNavigate();
  const chatEndRef = useRef(null);
  const chatBodyRef = useRef(null);
  const inputRef = useRef(null);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);

  // Auto-scroll to bottom
  useEffect(() => {
    if (showAiPanel && isPinnedToBottom && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showAiPanel, isPinnedToBottom]);

  // Auto-focus input when panel opens
  useEffect(() => {
    if (showAiPanel && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [showAiPanel]);

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
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
        setMessages(prev => [...prev, { sender: 'bot', text: data.message, options: data.options }]);
        setContext(data.context);
      } else if (data.type === 'waitlist') {
        setMessages(prev => [...prev, { sender: 'bot', text: data.message, waitlistData: data.waitlistData }]);
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
        setMessages(prev => [...prev, { sender: 'bot', text: data.message || 'Great, taking you to checkout now...' }]);
        setTimeout(() => {
          setShowAiPanel(false);
          navigate('/checkout', { state: data.payload });
        }, 900);
      }
    } catch {
      setMessages(prev => [...prev, { sender: 'bot', text: 'Network error. Please try again.' }]);
    }
    setLoading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    sendRequest(prompt.trim(), context);
  };

  const handleOptionClick = (opt) => {
    if (loading) return;
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
        setMessages(prev => [...prev, { sender: 'bot', text: "You've been added to the waitlist! We'll notify you if seats open up." }]);
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

  const canSend = !loading && prompt.trim().length > 0;

  return (
    <>
      <style>{`
        @keyframes botFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { transform: scale(0.45); opacity: 0.35; }
          40% { transform: scale(1); opacity: 1; }
        }
        .bot-msg-enter { animation: botFadeIn 0.22s ease forwards; }
        .bot-chip:hover:not(:disabled) {
          background: rgba(212,175,55,0.22) !important;
          border-color: rgba(212,175,55,0.9) !important;
          transform: translateY(-1px);
        }
        .bot-chip { transition: all 0.15s ease; }
        .bot-send-btn:hover:not(:disabled) { transform: scale(1.1); }
        .bot-send-btn { transition: all 0.2s ease; }
      `}</style>

      {/* FAB */}
      <div className="ai-fab" onClick={() => setShowAiPanel(!showAiPanel)} title="AI Booking Concierge">
        <span style={{ marginRight: '8px' }}>✨</span> Book Instantly
      </div>

      {showAiPanel && (
        <div style={{
          position: 'fixed', bottom: 80, right: 24,
          width: 'min(390px, calc(100vw - 32px))',
          height: 'min(590px, calc(100dvh - 110px))',
          background: 'linear-gradient(160deg, #0c0e1a 0%, #11131f 100%)',
          border: '1px solid rgba(212,175,55,0.22)',
          borderRadius: 20,
          boxShadow: '0 28px 70px rgba(0,0,0,0.75), 0 0 0 1px rgba(212,175,55,0.07)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden', zIndex: 9999
        }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '13px 16px',
            background: 'linear-gradient(90deg, rgba(212,175,55,0.11) 0%, rgba(139,111,61,0.07) 100%)',
            borderBottom: '1px solid rgba(212,175,55,0.14)',
            flexShrink: 0
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'linear-gradient(135deg, #d4af37, #8b6f3d)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.05rem', boxShadow: '0 0 14px rgba(212,175,55,0.45)'
              }}>✨</div>
              <div>
                <div style={{ color: '#d4af37', fontWeight: 700, fontSize: '0.88rem', letterSpacing: '0.3px' }}>
                  ShowsNow Concierge
                </div>
                <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: '0.7rem' }}>
                  Powered by Gemini AI
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowAiPanel(false)}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.55)', borderRadius: '50%',
                width: 28, height: 28, cursor: 'pointer', fontSize: '0.8rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >✕</button>
          </div>

          {/* Chat body */}
          <div
            ref={chatBodyRef}
            onScroll={handleChatScroll}
            onWheel={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
            style={{
              flex: '1 1 auto', minHeight: 0, padding: '14px 14px',
              overflowY: 'auto', overscrollBehavior: 'contain',
              display: 'flex', flexDirection: 'column', gap: '12px'
            }}
          >
            {messages.map((m, i) => (
              <div key={i} className="bot-msg-enter" style={{
                alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%', flexShrink: 0
              }}>
                <div style={{
                  background: m.sender === 'user'
                    ? 'linear-gradient(135deg, #d4af37, #8b6f3d)'
                    : 'rgba(255,255,255,0.075)',
                  color: 'white',
                  padding: '10px 14px',
                  borderRadius: m.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  boxShadow: m.sender === 'user' ? '0 4px 14px rgba(212,175,55,0.22)' : 'none',
                  border: m.sender === 'bot' ? '1px solid rgba(255,255,255,0.075)' : 'none',
                  fontSize: '0.88rem', lineHeight: 1.6
                }}>
                  {m.text}
                </div>

                {/* Option chips */}
                {m.options && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
                    {m.options.map((opt, idx) => (
                      <button
                        key={idx}
                        className="bot-chip"
                        onClick={() => handleOptionClick(opt)}
                        disabled={loading}
                        style={{
                          background: 'rgba(212,175,55,0.08)',
                          border: '1px solid rgba(212,175,55,0.48)',
                          color: loading ? 'rgba(244,217,139,0.35)' : '#f4d98b',
                          padding: '5px 13px', borderRadius: 20,
                          fontSize: '0.76rem',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          backdropFilter: 'blur(4px)'
                        }}
                      >{opt}</button>
                    ))}
                  </div>
                )}

                {/* Waitlist */}
                {m.waitlistData && (
                  <div style={{ marginTop: 10 }}>
                    <button
                      onClick={() => handleJoinWaitlist(m.waitlistData)}
                      disabled={loading}
                      style={{
                        background: 'linear-gradient(135deg, #1ea83c, #16872f)',
                        color: 'white', border: 'none', padding: '8px 18px',
                        borderRadius: 20, cursor: 'pointer', fontWeight: 600,
                        fontSize: '0.8rem', boxShadow: '0 4px 12px rgba(30,168,60,0.28)'
                      }}
                    >🔔 Join Waitlist</button>
                  </div>
                )}
              </div>
            ))}

            {/* 3-dot animated typing indicator */}
            {loading && (
              <div style={{ alignSelf: 'flex-start', flexShrink: 0 }}>
                <div style={{
                  background: 'rgba(255,255,255,0.075)',
                  border: '1px solid rgba(255,255,255,0.075)',
                  borderRadius: '18px 18px 18px 4px',
                  padding: '12px 16px',
                  display: 'inline-flex', gap: 5, alignItems: 'center'
                }}>
                  {[0, 1, 2].map(j => (
                    <div key={j} style={{
                      width: 7, height: 7, borderRadius: '50%', background: '#d4af37',
                      animation: `dotPulse 1.3s ease-in-out ${j * 0.22}s infinite`
                    }} />
                  ))}
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            style={{
              padding: '11px 13px',
              background: 'rgba(255,255,255,0.04)',
              borderTop: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', gap: 9, alignItems: 'center', flexShrink: 0
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Ask anything..."
              disabled={loading}
              style={{
                flex: 1, padding: '10px 15px', borderRadius: 30,
                background: 'rgba(0,0,0,0.42)',
                border: '1px solid rgba(255,255,255,0.09)',
                outline: 'none', color: 'white', fontSize: '0.88rem'
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.45)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; }}
            />
            <button
              type="submit"
              className="bot-send-btn"
              disabled={!canSend}
              style={{
                background: canSend ? 'linear-gradient(135deg, #d4af37, #8b6f3d)' : 'rgba(255,255,255,0.07)',
                color: canSend ? '#0A0A0A' : 'rgba(255,255,255,0.25)',
                border: 'none', borderRadius: '50%',
                width: 40, height: 40, minWidth: 40,
                cursor: canSend ? 'pointer' : 'not-allowed',
                fontWeight: 'bold', fontSize: '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: canSend ? '0 4px 14px rgba(212,175,55,0.32)' : 'none',
              }}
            >➤</button>
          </form>
        </div>
      )}
    </>
  );
};

export default AutonomousBot;
