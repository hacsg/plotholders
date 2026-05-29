import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [message, setMessage] = useState('');

  const load = async () => {
    if (!id) return;
    const res = await fetch(`/api/customers/${id}`);
    if (res.ok) {
      const data = await res.json();
      setCustomer(data);
      setEditForm({ name: data.name || '', email: data.email || '', birthday: data.birthday || '' });
    }
  };

  useEffect(() => { load(); }, [id]);

  const save = async () => {
    await fetch(`/api/customers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    setMessage('Saved!');
    load();
    setTimeout(() => setMessage(''), 1400);
  };

  const overrideTier = async (newTier: string) => {
    await fetch(`/api/customers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: newTier }),
    });
    load();
  };

  if (!customer) return <div style={{ padding: 40 }}>Loading customer...</div>;

  const nextTierAcres = customer.tier === 'landowner' ? 9999 : customer.tier === 'homesteader' ? 200 : customer.tier === 'grower' ? 50 : 10;
  const progress = Math.min(100, Math.round((customer.lifetime_acres / nextTierAcres) * 100));

  return (
    <div style={{ padding: 28 }}>
      <Link to="/customers">← Back to list</Link>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, marginTop: 20 }}>
        {/* Info */}
        <div style={{ background: '#fff', padding: 24, borderRadius: 12 }}>
          <h2>{customer.name || customer.phone}</h2>
          <div style={{ color: '#666' }}>{customer.phone} • {customer.email || 'no email'}</div>

          <div style={{ margin: '20px 0' }}>
            <div className="tier-badge" style={{ fontSize: 15 }}>{customer.tier}</div>
            <div style={{ marginTop: 16 }}>
              <strong>{customer.lifetime_acres}</strong> lifetime acres
              <div style={{ height: 8, background: '#eee', borderRadius: 99, marginTop: 8 }}>
                <div style={{ width: `${progress}%`, height: '100%', background: '#2f6f3e', borderRadius: 99 }} />
              </div>
              <div style={{ fontSize: 12, color: '#777' }}>{customer.lifetime_acres} / {nextTierAcres} to next tier</div>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Name" style={{ display: 'block', marginBottom: 8, width: '100%' }} />
            <input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} placeholder="Email" style={{ display: 'block', marginBottom: 8, width: '100%' }} />
            <input value={editForm.birthday} onChange={e => setEditForm({ ...editForm, birthday: e.target.value })} placeholder="Birthday YYYY-MM-DD" style={{ display: 'block', marginBottom: 12, width: '100%' }} />
            <button onClick={save}>Save Changes</button> {message && <span style={{ color: '#2a7', marginLeft: 12 }}>{message}</span>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
          <h4>Actions</h4>
          <div style={{ marginBottom: 12 }}>
            Override Tier:
            {['seedling', 'grower', 'homesteader', 'landowner'].map(t => (
              <button key={t} onClick={() => overrideTier(t)} style={{ margin: 3, padding: '4px 10px', fontSize: 12, background: customer.tier === t ? '#2f6f3e' : '#eee', color: customer.tier === t ? '#fff' : '#333' }}>{t}</button>
            ))}
          </div>

          <div style={{ fontSize: 13, color: '#777' }}>
            Merge customers and advanced tools coming in future phase.
          </div>
        </div>
      </div>

      {/* History Tables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
          <h3>Acres History</h3>
          {(customer.acre_history || []).slice(0, 8).map((a: any, idx: number) => (
            <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid #f3f3f3', fontSize: 13 }}>
              +{a.amount} • {a.channel} • {a.reason || ''} • {new Date(a.created_at).toLocaleDateString()}
            </div>
          ))}
        </div>
        <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
          <h3>Rewards History</h3>
          {(customer.reward_history || []).length === 0 && <div style={{ color: '#888' }}>No rewards redeemed yet.</div>}
          {(customer.reward_history || []).slice(0, 6).map((r: any, i: number) => (
            <div key={i} style={{ fontSize: 13, padding: '4px 0' }}>
              {r.reward_type} ({r.tier}) — {new Date(r.redeemed_at).toLocaleDateString()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
