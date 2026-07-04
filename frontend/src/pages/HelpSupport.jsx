import { useState } from 'react';

const HelpSupport = () => {
  const [activeFaq, setActiveFaq] = useState(null);
  const [formStatus, setFormStatus] = useState('idle'); // idle, submitting, success

  const faqs = [
    {
      q: "My booking failed but money was deducted. What do I do?",
      a: "Don't worry! If a booking fails, our system automatically initiates a refund within 15 minutes. It usually reflects in your bank account within 3-5 business days."
    },
    {
      q: "How does the Autonomous Surge Engine work?",
      a: "Our AI monitors real-time demand. High demand shows may see a small price increase (surge), which allows us to guarantee premium service and availability for those who really want it."
    },
    {
      q: "Can I cancel my tickets?",
      a: "Tickets booked on ShowsNow are non-refundable unless you have purchased the 'Flexi-Cancellation' add-on during checkout."
    },
    {
      q: "How do I redeem my loyalty points?",
      a: "You can view your points in the 'Rewards Program' section. Points can be applied at checkout for discounts on tickets or snacks."
    }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormStatus('submitting');
    setTimeout(() => {
      setFormStatus('success');
    }, 1500);
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 70px)', background: '#111217', color: 'white', padding: '4rem 2rem' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem', background: 'linear-gradient(45deg, #fff, #aaa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          Help & Support
        </h1>
        <p style={{ color: '#aaa', fontSize: '1.1rem', marginBottom: '3rem' }}>We're here to help you have the best cinematic experience.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem' }}>
          
          {/* FAQ Section */}
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>Frequently Asked Questions</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {faqs.map((faq, idx) => (
                <div key={idx} style={{ background: '#1a1c23', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div 
                    onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}
                    style={{ padding: '1.2rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: activeFaq === idx ? 'rgba(255,255,255,0.05)' : 'transparent' }}
                  >
                    <span style={{ fontWeight: '600', fontSize: '1rem' }}>{faq.q}</span>
                    <span style={{ fontSize: '1.2rem', color: '#c084fc', transform: activeFaq === idx ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.3s' }}>▼</span>
                  </div>
                  {activeFaq === idx && (
                    <div style={{ padding: '0 1.2rem 1.2rem', color: '#aaa', lineHeight: '1.6', fontSize: '0.95rem' }}>
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Contact Form */}
          <div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>Contact Us</h2>
            
            {formStatus === 'success' ? (
              <div style={{ background: 'rgba(76, 175, 80, 0.1)', border: '1px solid #4CAF50', padding: '2rem', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem', color: '#4CAF50' }}>✓</div>
                <h3 style={{ color: '#4CAF50', marginBottom: '0.5rem' }}>Message Sent!</h3>
                <p style={{ color: '#aaa' }}>Our support team will get back to you within 24 hours.</p>
                <button 
                  onClick={() => setFormStatus('idle')}
                  style={{ marginTop: '1.5rem', background: 'transparent', border: '1px solid #4CAF50', color: '#4CAF50', padding: '8px 24px', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Send Another
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', background: '#1a1c23', padding: '2rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.9rem' }}>Full Name</label>
                  <input type="text" required style={{ width: '100%', padding: '12px', background: '#111217', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.9rem' }}>Email Address</label>
                  <input type="email" required style={{ width: '100%', padding: '12px', background: '#111217', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.9rem' }}>Issue Type</label>
                  <select required style={{ width: '100%', padding: '12px', background: '#111217', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', outline: 'none' }}>
                    <option value="">Select an issue...</option>
                    <option value="booking">Booking / Payment Failure</option>
                    <option value="refund">Refund Status</option>
                    <option value="account">Account / Profile</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', color: '#888', fontSize: '0.9rem' }}>Description</label>
                  <textarea required rows="4" style={{ width: '100%', padding: '12px', background: '#111217', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: 'white', outline: 'none', resize: 'vertical' }}></textarea>
                </div>
                <button 
                  type="submit" 
                  disabled={formStatus === 'submitting'}
                  style={{ background: formStatus === 'submitting' ? '#555' : 'var(--bms-red)', color: 'white', border: 'none', padding: '14px', borderRadius: '6px', fontWeight: 'bold', fontSize: '1rem', cursor: formStatus === 'submitting' ? 'wait' : 'pointer', marginTop: '10px' }}
                >
                  {formStatus === 'submitting' ? 'Sending...' : 'Submit Request'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpSupport;
