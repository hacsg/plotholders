import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const TIERS = ['seedling', 'grower', 'homesteader', 'landowner'];

export default function CustomerList() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ phone: '', name: '', email: '' });

  const load = async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (tierFilter) params.set('tier', tierFilter);
    params.set('limit', '100');
    const res = await fetch(`/api/customers?${params}`);
    const json = await res.json();
    setCustomers(json.data || []);
  };

  useEffect(() => { load(); }, [q, tierFilter]);

  const addCustomer = async () => {
    if (!newCustomer.phone) return;
    await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCustomer),
    });
    setShowAdd(false);
    setNewCustomer({ phone: '', name: '', email: '' });
    load();
  };

  return (
    <div style={{ padding: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Customers</h1>
        <button onClick={() => setShowAdd(true)} style={{ padding: '10px 18px' }}>+ Add Customer</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input placeholder="Search name, phone, email..." value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, padding: 10 }} />
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)} style={{ padding: 10 }}>
          <option value="">All tiers</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#f6f6f7' }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '12px 16px' }}>Name / Phone</th>
              <th>Tier</th>
              <th>Acres</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map(c => (
              <tr key={c.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '12px 16px' }}>
                  <Link to={`/customers/${c.id}`} style={{ fontWeight: 600 }}>{c.name || '—'}</Link><br />
                  <span style={{ fontSize: 12, color: '#666' }}>{c.phone}</span>
                </td>
                <td><span style={{ padding: '2px 8px', background: '#e8f0e9', borderRadius: 4, fontSize: 12 }}>{c.tier}</span></td>
                <td>{c.lifetime_acres}</td>
                <td style={{ fontSize: 12, color: '#777' }}>{new Date(c.created_at).toLocaleDateString()}</td>
                <td><Link to={`/customers/${c.id}`}>View →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', padding: 28, width: 380, borderRadius: 12 }}>
            <h3>Add New Customer</h3>
            <input placeholder="Phone (+65...)" value={newCustomer.phone} onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })} style={{ marginBottom: 8, width: '100%' }} />
            <input placeholder="Name" value={newCustomer.name} onChange={e => setNewCustomer({ ...newCustomer, name: e.target.value })} style={{ marginBottom: 8, width: '100%' }} />
            <input placeholder="Email" value={newCustomer.email} onChange={e => setNewCustomer({ ...newCustomer, email: e.target.value })} style={{ marginBottom: 16, width: '100%' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAdd(false)} style={{ background: '#ccc', color: '#333', flex: 1 }}>Cancel</button>
              <button onClick={addCustomer} style={{ flex: 1 }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
