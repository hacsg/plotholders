import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface Stats {
  totalCustomers: number;
  acresThisMonth: number;
  tierDistribution: Record<string, number>;
  topCustomers: any[];
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats>({
    totalCustomers: 0,
    acresThisMonth: 0,
    tierDistribution: { seedling: 0, grower: 0, homesteader: 0, landowner: 0 },
    topCustomers: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load real data from APIs
    Promise.all([
      fetch('/api/customers?limit=100').then(r => r.json()),
      fetch('/api/acres').then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
    ]).then(([custRes, acresRes]) => {
      const customers = custRes.data || [];
      const acres = acresRes.data || [];

      const tierDist = { seedling: 0, grower: 0, homesteader: 0, landowner: 0 };
      customers.forEach((c: any) => { if (tierDist[c.tier as keyof typeof tierDist] !== undefined) tierDist[c.tier as keyof typeof tierDist]++; });

      const now = new Date();
      const thisMonthAcres = acres.filter((a: any) => {
        const d = new Date(a.created_at);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).reduce((sum: number, a: any) => sum + (a.amount || 0), 0);

      const top = [...customers]
        .sort((a, b) => (b.lifetime_acres || 0) - (a.lifetime_acres || 0))
        .slice(0, 8);

      setStats({
        totalCustomers: customers.length,
        acresThisMonth: thisMonthAcres,
        tierDistribution: tierDist,
        topCustomers: top,
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const tiers = Object.entries(stats.tierDistribution);

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ margin: '0 0 24px' }}>Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: '#666' }}>Total Plot Holders</div>
          <div style={{ fontSize: 42, fontWeight: 700 }}>{stats.totalCustomers}</div>
        </div>
        <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: '#666' }}>Acres Sealed This Month</div>
          <div style={{ fontSize: 42, fontWeight: 700 }}>{stats.acresThisMonth}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Tier Distribution */}
        <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Tier Distribution</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 180, gap: 14, paddingTop: 20 }}>
            {tiers.map(([tier, count]) => {
              const max = Math.max(...tiers.map(t => t[1])) || 1;
              const h = Math.max(20, Math.round((count / max) * 140));
              return (
                <div key={tier} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ background: '#2f6f3e', height: h, borderRadius: 4, margin: '0 auto', width: 38 }} />
                  <div style={{ fontSize: 12, marginTop: 6 }}>{tier}</div>
                  <div style={{ fontWeight: 700 }}>{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Customers */}
        <div style={{ background: '#fff', padding: 20, borderRadius: 12 }}>
          <h3 style={{ marginTop: 0 }}>Top Customers</h3>
          {loading ? <div>Loading...</div> : (
            <table style={{ width: '100%', fontSize: 14 }}>
              <thead><tr><th>Name / Phone</th><th>Tier</th><th style={{ textAlign: 'right' }}>Acres</th></tr></thead>
              <tbody>
                {stats.topCustomers.map((c: any, i: number) => (
                  <tr key={i}>
                    <td><Link to={`/customers/${c.id}`}>{c.name || c.phone}</Link></td>
                    <td><span style={{ fontSize: 12, background: '#e8f0e9', padding: '1px 7px', borderRadius: 4 }}>{c.tier}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{c.lifetime_acres}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ marginTop: 24, fontSize: 13, color: '#777' }}>
        Quick links: <Link to="/customers">Manage customers</Link> · <Link to="/import">Import Qashier CSV</Link> · <Link to="/birthdays">Upcoming birthdays</Link>
      </div>
    </div>
  );
};

export default Dashboard;
