import React, { useState } from 'react';

interface Props {
  onSend: (contact: string, method: 'email' | 'sms') => Promise<void>;
  onVerify: (payload: { token?: string; code?: string; phone?: string }) => Promise<void>;
  loading: boolean;
}

const Login: React.FC<Props> = ({ onSend, onVerify, loading }) => {
  const [stage, setStage] = useState<'contact' | 'verify'>('contact');
  const [contact, setContact] = useState('');
  const [method, setMethod] = useState<'email' | 'sms'>('email');
  const [verifyInput, setVerifyInput] = useState('');
  const [sentTo, setSentTo] = useState('');

  const isEmail = (v: string) => v.includes('@');

  const handleSend = async () => {
    if (!contact) return;
    const m = isEmail(contact) ? 'email' : 'sms';
    setMethod(m);
    setSentTo(contact);
    await onSend(contact, m);
    setStage('verify');
    setVerifyInput('');
  };

  const handleVerify = async () => {
    if (!verifyInput) return;

    if (method === 'email') {
      await onVerify({ token: verifyInput.trim().toUpperCase() });
    } else {
      await onVerify({ code: verifyInput.trim(), phone: sentTo });
    }
  };

  const reset = () => {
    setStage('contact');
    setContact('');
    setVerifyInput('');
    setSentTo('');
  };

  return (
    <div style={{ maxWidth: 380, margin: '80px auto', padding: 24 }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 52, marginBottom: 8 }}>🌱</div>
        <h1 style={{ margin: 0, color: '#2f6f3e' }}>Plot Holders Club</h1>
        <p style={{ color: '#555' }}>Hundred Acre Coffee loyalty</p>
      </div>

      <div className="card">
        {stage === 'contact' ? (
          <>
            <h3 style={{ marginTop: 0 }}>Sign in</h3>
            <p style={{ color: '#666', fontSize: 14 }}>Enter your phone or email. We'll send a secure code.</p>

            <input
              placeholder="Phone (9123 4567) or email@you.com"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              style={{ marginBottom: 12 }}
            />

            <button
              style={{ width: '100%' }}
              disabled={loading || !contact}
              onClick={handleSend}
            >
              {loading ? 'Sending...' : 'Send Magic Link or SMS Code'}
            </button>

            <div style={{ marginTop: 16, fontSize: 12, color: '#888', textAlign: 'center' }}>
              Real auth powered by magic links &amp; SMS (codes expire quickly)
            </div>
          </>
        ) : (
          <>
            <h3 style={{ marginTop: 0 }}>Check your {method === 'email' ? 'email' : 'phone'}</h3>
            <p style={{ color: '#666', fontSize: 14 }}>
              We sent a {method === 'email' ? 'magic link / 6-char code' : '6-digit code'} to <strong>{sentTo}</strong>
            </p>

            <input
              placeholder={method === 'email' ? 'Enter 6-char token (e.g. A1B2C3)' : 'Enter 6-digit code'}
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              style={{ textTransform: method === 'email' ? 'uppercase' : 'none' }}
            />

            <button
              style={{ marginTop: 8, width: '100%' }}
              disabled={loading || !verifyInput}
              onClick={handleVerify}
            >
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>

            <button
              onClick={reset}
              style={{ marginTop: 12, width: '100%', background: '#666' }}
            >
              Use different email/phone
            </button>

            <div style={{ marginTop: 16, fontSize: 12, color: '#888', textAlign: 'center' }}>
              The code is valid for a few minutes.
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Login;
