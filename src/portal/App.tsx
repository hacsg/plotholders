import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import History from './components/History';
import Referrals from './components/Referrals';
import Profile from './components/Profile';

type Page = 'dashboard' | 'history' | 'referrals' | 'profile';

interface PortalUser {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  tier: string;
  lifetime_acres: number;
  referral_code: string | null;
}

const PortalApp: React.FC = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('ph_token'));
  const [user, setUser] = useState<PortalUser | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [loading, setLoading] = useState(false);

  // Real auth: send magic link or SMS code
  const handleSend = async (contact: string, method: 'email' | 'sms') => {
    setLoading(true);
    try {
      const endpoint = method === 'email' ? '/api/auth/magic-link' : '/api/auth/sms-code';
      const body = method === 'email' ? { email: contact } : { phone: contact };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        alert(json.message || 'Failed to send code');
        return;
      }
      // Success message is shown in Login component via stage change
    } catch (e) {
      alert('Failed to send authentication code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Real verify: exchange token or code for JWT
  const handleVerify = async (payload: { token?: string; code?: string; phone?: string }) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.token) {
        alert(json.message || 'Verification failed — code may be expired.');
        setLoading(false);
        return;
      }

      // Store real JWT
      localStorage.setItem('ph_token', json.token);
      localStorage.setItem('ph_user_id', json.customer_id);

      setToken(json.token);
      await loadUser(json.customer_id);
    } catch (e) {
      alert('Verification failed. Check console.');
    }
    setLoading(false);
  };

  const loadUser = async (idOrMe: string) => {
    // Prefer the new protected /api/me when we have a token
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    if (idOrMe === 'me' || !idOrMe.startsWith('fake')) {
      res = await fetch('/api/customers/me', { headers });
    } else {
      res = await fetch(`/api/customers/${idOrMe}`);
    }

    if (res.ok) {
      const data = await res.json();
      setUser({
        id: data.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        tier: data.tier,
        lifetime_acres: data.lifetime_acres,
        referral_code: data.referral_code,
      });
    } else if (res.status === 401) {
      // Token invalid/expired — force logout
      logout();
    }
  };

  const logout = () => {
    localStorage.removeItem('ph_token');
    localStorage.removeItem('ph_user_id');
    setToken(null);
    setUser(null);
    setPage('dashboard');
  };

  // Load profile using /me when token exists
  useEffect(() => {
    if (token && !user) {
      loadUser('me');
    }
  }, [token]);

  if (!token || !user) {
    return <Login onSend={handleSend} onVerify={handleVerify} loading={loading} />;
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: '#2f6f3e' }}>Plot Holders Club</div>
        <button onClick={logout} style={{ background: '#666', padding: '6px 14px', fontSize: 13 }}>Log out</button>
      </div>

      <div className="nav">
        <a href="#" onClick={() => setPage('dashboard')} style={{ fontWeight: page === 'dashboard' ? 800 : 500 }}>Dashboard</a>
        <a href="#" onClick={() => setPage('history')} style={{ fontWeight: page === 'history' ? 800 : 500 }}>History</a>
        <a href="#" onClick={() => setPage('referrals')} style={{ fontWeight: page === 'referrals' ? 800 : 500 }}>Referrals</a>
        <a href="#" onClick={() => setPage('profile')} style={{ fontWeight: page === 'profile' ? 800 : 500 }}>Profile</a>
      </div>

      {page === 'dashboard' && <Dashboard user={user} onNavigate={setPage} />}
      {page === 'history' && <History userId={user.id} />}
      {page === 'referrals' && <Referrals user={user} />}
      {page === 'profile' && <Profile user={user} onUpdate={loadUser} />}
    </div>
  );
};

export default PortalApp;
