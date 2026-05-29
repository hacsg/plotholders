import React, { useEffect, useState } from 'react';

export default function BirthdayList() {
  const [birthdays, setBirthdays] = useState<any[]>([]);

  const load = async () => {
    const res = await fetch('/api/staff/upcoming-birthdays?days=14');
    const json = await res.json();
    setBirthdays(json.data || []);
  };

  useEffect(() => { load(); }, []);

  const triggerBirthday = async (id: string) => {
    // In real life would call a "send birthday" endpoint. For Phase 2 we just log.
    alert(`Birthday reward triggered for customer ${id} (check server logs)`);
    // You could call the daily function manually via a hidden admin route if needed.
  };

  return (
    <div style={{ padding: 28 }}>
      <h1>Upcoming Birthdays (14 days)</h1>
      <div style={{ background: '#fff', borderRadius: 12, padding: 12 }}>
        {birthdays.length === 0 && <p>No birthdays in the next two weeks.</p>}
        {birthdays.map((b, idx) => (
          <div key={idx} style={{ padding: '14px 16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <strong>{b.name || b.phone}</strong> — {b.birthday} (in {b.days_until} days) — {b.tier}
            </div>
            <button onClick={() => triggerBirthday(b.id)} style={{ padding: '6px 14px', fontSize: 13 }}>Send Birthday Reward</button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, fontSize: 13, color: '#666' }}>
        Note: Actual sending of codes happens in the daily cron job. This button is a placeholder.
      </div>
    </div>
  );
}
