import React from 'react';

interface Props {
  data: {
    customer: any;
    tier: string;
    lifetime_acres: number;
    available_rewards: Array<{ reward_type: string; label: string; available: boolean }>;
  };
  onRedeem: (reward: { reward_type: string; label: string }) => void;
  onReset: () => void;
}

const tierColors: Record<string, string> = {
  seedling: '#4a7c59',
  grower: '#2f6f3e',
  homesteader: '#1e4d2b',
  landowner: '#0f2a17',
};

const CustomerCard: React.FC<Props> = ({ data, onRedeem, onReset }) => {
  const { customer, tier, lifetime_acres, available_rewards } = data;
  const displayName = customer.name || customer.phone;

  return (
    <div>
      <button onClick={onReset} style={{ background: 'transparent', color: '#666', fontSize: 14, padding: '4px 0', width: 'auto', marginBottom: 12 }}>
        ← New Lookup
      </button>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{displayName}</div>
            <div style={{ color: '#666', fontSize: 15, marginTop: 2 }}>{customer.phone}</div>
          </div>
          <div className="tier-badge" style={{ background: tierColors[tier] + '22', color: tierColors[tier] }}>
            {tier.toUpperCase()}
          </div>
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#666' }}>LIFETIME ACRES SEALED</div>
          <div className="stat">{lifetime_acres}</div>
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 15 }}>Available Rewards</div>

          {available_rewards.length === 0 && <div style={{ color: '#777' }}>No rewards available at this tier today.</div>}

          {available_rewards.map((r, idx) => (
            <div key={idx} className="reward-row">
              <div>
                {r.available ? '✓' : '○'} {r.label}
              </div>
              {r.available ? (
                <button
                  onClick={() => onRedeem(r)}
                  style={{ width: 'auto', padding: '8px 18px', fontSize: 14 }}
                >
                  Redeem
                </button>
              ) : (
                <span style={{ color: '#aaa', fontSize: 13 }}>Unavailable</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CustomerCard;
