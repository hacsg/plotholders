import React from 'react';

interface User {
  id: string; name: string | null; phone: string; email: string | null;
  tier: string; lifetime_acres: number; referral_code: string | null;
}

interface Props {
  user: User;
  onNavigate: (page: 'history' | 'referrals' | 'profile') => void;
}

const TIER_THRESHOLDS: Record<string, { next: number; label: string }> = {
  seedling: { next: 10, label: 'Grower' },
  grower: { next: 50, label: 'Homesteader' },
  homesteader: { next: 200, label: 'Landowner' },
  landowner: { next: 9999, label: 'Legend' },
};

const Dashboard: React.FC<Props> = ({ user, onNavigate }) => {
  const { tier, lifetime_acres } = user;
  const threshold = TIER_THRESHOLDS[tier] || { next: 10, label: 'Grower' };
  const progress = Math.min(100, Math.round((lifetime_acres / threshold.next) * 100));

  const perks = [
    { name: 'Free coffee on your birthday', unlocked: true },
    { name: 'Free 6-pack upgrade', unlocked: ['grower', 'homesteader', 'landowner'].includes(tier) },
    { name: '10% off every purchase', unlocked: ['grower', 'homesteader', 'landowner'].includes(tier) },
    { name: 'Priority seating & events', unlocked: ['homesteader', 'landowner'].includes(tier) },
    { name: 'Exclusive merchandise', unlocked: tier === 'landowner' },
  ];

  return (
    <div>
      <div className="card">
        <div>Welcome back, <strong>{user.name || user.phone}</strong> 👋</div>
        <div style={{ marginTop: 16 }}>
          <span className="tier-badge">{tier.toUpperCase()}</span>
        </div>
        <div style={{ margin: '20px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <div>{lifetime_acres} acres sealed</div>
            <div>{threshold.next} for {threshold.label}</div>
          </div>
          <div className="progress"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Your Perks</h3>
        {perks.map((p, i) => (
          <div key={i} style={{ padding: '8px 0', color: p.unlocked ? '#2f6f3e' : '#aaa' }}>
            {p.unlocked ? '✓' : '○'} {p.name}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={() => onNavigate('history')}>View History</button>
        <button onClick={() => onNavigate('referrals')}>Refer a Friend</button>
        <button onClick={() => onNavigate('profile')}>Edit Profile</button>
      </div>
    </div>
  );
};

export default Dashboard;
