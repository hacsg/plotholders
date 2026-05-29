import React, { useState, useEffect } from 'react';

interface User { id: string; referral_code: string | null; }

const Referrals: React.FC<{ user: User }> = ({ user }) => {
  const [stats, setStats] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const referralLink = user.referral_code
    ? `https://plotholders.hundredacre.sg/join?ref=${user.referral_code}`
    : 'Loading...';

  useEffect(() => {
    if (user.id) {
      fetch(`/api/referrals/${user.id}`)
        .then(r => r.json())
        .then(setStats)
        .catch(() => {});
    }
  }, [user.id]);

  const copy = () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div>
      <div className="card">
        <h3>Your Referral Link</h3>
        <div style={{ background: '#f4f1e9', padding: 14, borderRadius: 8, wordBreak: 'break-all', fontFamily: 'monospace' }}>
          {referralLink}
        </div>
        <button onClick={copy} style={{ marginTop: 12 }}>{copied ? 'Copied!' : 'Copy to clipboard'}</button>
      </div>

      <div className="card">
        <h3>Stats</h3>
        {stats ? (
          <>
            <div><strong>{stats.total_referred || 0}</strong> friends joined</div>
            <div><strong>{stats.total_bonus_acres || 0}</strong> bonus acres earned</div>
          </>
        ) : <div>Loading stats...</div>}
      </div>
    </div>
  );
};

export default Referrals;
