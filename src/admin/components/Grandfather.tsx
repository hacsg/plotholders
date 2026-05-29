import React, { useState } from 'react';

const TIERS = ['seedling', 'grower', 'homesteader', 'landowner'] as const;

interface SeededCustomer {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  tier: string;
}

export default function Grandfather() {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    tier: 'seedling' as (typeof TIERS)[number],
  });
  const [seeded, setSeeded] = useState<SeededCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadSeeded = async () => {
    try {
      const res = await fetch('/api/customers?limit=100');
      const json = await res.json();
      const filtered = (json.data || []).filter((c: any) => c.migration_source === 'grandfather');
      setSeeded(filtered);
    } catch (e) {
      console.error('Failed to load seeded customers', e);
    }
  };

  React.useEffect(() => {
    loadSeeded();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone) {
      setMessage('Phone is required');
      return;
    }
    setLoading(true);
    setMessage(null);

    try {
      const payload = {
        phone: form.phone,
        name: form.name || undefined,
        email: form.email || undefined,
        // We manually set tier via PATCH after create (grandfather path)
      };

      const createRes = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, migration_source: 'grandfather' }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.message || 'Create failed');
      }

      const created = await createRes.json();

      // Set the desired tier + migration_source flag if not already
      await fetch(`/api/customers/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: form.tier }),
      });

      setMessage(`✅ Seeded ${form.name || form.phone} as ${form.tier}`);
      setForm({ name: '', phone: '', email: '', tier: 'seedling' });
      await loadSeeded();
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 28, maxWidth: 820 }}>
      <h1 style={{ marginTop: 0 }}>Seed Grandfathered Regulars</h1>
      <p style={{ color: '#555', maxWidth: 620 }}>
        Manually onboard long-time regulars who are being grandfathered into Plot Holders with an initial tier.
        These customers will bypass normal onboarding and start with the chosen tier.
      </p>

      <div className="card" style={{ padding: 20, marginBottom: 32 }}>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
              style={{ width: '100%', padding: 10 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Phone *</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="9123 4567"
                required
                style={{ width: '100%', padding: 10 }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@example.com"
                type="email"
                style={{ width: '100%', padding: 10 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>Starting Tier</label>
            <select
              value={form.tier}
              onChange={(e) => setForm({ ...form, tier: e.target.value as any })}
              style={{ padding: 10, width: 220 }}
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" disabled={loading || !form.phone} style={{ width: 160, marginTop: 8 }}>
            {loading ? 'Seeding...' : 'Seed Customer'}
          </button>
        </form>

        {message && (
          <div style={{ marginTop: 16, padding: 12, background: '#f0f7f2', borderRadius: 6, color: '#2f6f3e' }}>
            {message}
          </div>
        )}
      </div>

      <h3>Recently Seeded (migration_source = grandfather)</h3>
      {seeded.length === 0 ? (
        <p style={{ color: '#777' }}>No grandfathered customers yet.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd', textAlign: 'left' }}>
              <th style={{ padding: '8px 4px' }}>Name</th>
              <th style={{ padding: '8px 4px' }}>Phone</th>
              <th style={{ padding: '8px 4px' }}>Email</th>
              <th style={{ padding: '8px 4px' }}>Tier</th>
            </tr>
          </thead>
          <tbody>
            {seeded.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '8px 4px' }}>{c.name || '—'}</td>
                <td style={{ padding: '8px 4px' }}>{c.phone}</td>
                <td style={{ padding: '8px 4px' }}>{c.email || '—'}</td>
                <td style={{ padding: '8px 4px' }}>
                  <span style={{ padding: '2px 8px', background: '#e6f2ea', borderRadius: 999, fontSize: 12 }}>
                    {c.tier}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
