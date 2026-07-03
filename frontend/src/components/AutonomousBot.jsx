import { useState, useContext, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { apiUrl } from '../api';

const AutonomousBot = () => {
  const { token } = useContext(AppContext);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Hi! Tell me what you want to watch (e.g. "Book 2 tickets for an action movie in Mumbai tonight").' }
  ]);
  const [context, setContext] = useState(null);
  
  const navigate = useNavigate();
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showAiPanel]);

  const sendRequest = async (userText, currentContext) => {
    setLoading(true);
    setMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setPrompt('');

    try {
      const res = await fetch(apiUrl('/api/autonomous-agent'), {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: userText, context: currentContext })
      });
      const data = await res.json();
      
      if (!res.ok) {
        setMessages(prev => [...prev, { sender: 'bot', text: data.error || 'Failed to process request.' }]);
        setLoading(false);
        return;
      }

      if (data.type === 'clarify') {
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
      } else if (data.payload) {
        setMessages(prev => [...prev, { sender: 'bot', text: 'Great! Teleporting you to checkout...' }]);
        setTimeout(() => {
          setShowAiPanel(false);
          navigate('/checkout', { state: data.payload.checkoutPayload || data.payload });
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
    sendRequest(opt, context);
  };

  const handleJoinWaitlist = async (waitlistData) => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/waitlist'), {
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

  return (
    <>
      <div className="ai-fab" onClick={() => setShowAiPanel(!showAiPanel)}>
        ✨
      </div>

      {showAiPanel && (
        <div className="ai-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="ai-header">
            <span>Conversational Agent</span>
            <span style={{ cursor: 'pointer' }} onClick={() => setShowAiPanel(false)}>✕</span>
          </div>
          
          <div className="ai-chat-body" style={{ flex: 1, padding: '1rem', overflowY: 'auto', background: '#f5f7f9', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{
                  background: m.sender === 'user' ? 'var(--bms-red)' : 'white',
                  color: m.sender === 'user' ? 'white' : '#333',
                  padding: '10px 14px', borderRadius: '12px',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.05)', fontSize: '0.9rem',
                  borderBottomRightRadius: m.sender === 'user' ? 0 : '12px',
                  borderBottomLeftRadius: m.sender === 'bot' ? 0 : '12px',
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
          
          <form onSubmit={handleSubmit} style={{ padding: '1rem', background: 'white', borderTop: '1px solid #eee', display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              value={prompt} 
              onChange={(e) => setPrompt(e.target.value)} 
              placeholder="Type your reply..." 
              disabled={loading}
              style={{ flex: 1, padding: '10px', borderRadius: '20px', border: '1px solid #ddd', outline: 'none' }}
            />
            <button type="submit" disabled={loading || !prompt.trim()} style={{
              background: 'var(--bms-red)', color: 'white', border: 'none',
              padding: '0 20px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold'
            }}>Send</button>
          </form>
        </div>
      )}
    </>
  );
};

export default AutonomousBot;
