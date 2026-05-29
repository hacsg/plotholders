import React, { useEffect, useState } from 'react';

interface Props { userId: string; }

const History: React.FC<Props> = ({ userId }) => {
  const [acres, setAcres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/customers/${userId}`)
      .then(r => r.json())
      .then(data => {
        setAcres(data.acre_history || []);
        setLoading(false);
      });
  }, [userId]);

  return (
    <div className="card">
      <h3>Transaction History</h3>
      {loading ? <div>Loading...</div> : (
        acres.length === 0 ? <p>No acres yet. Make a purchase!</p> : (
          <table>
            <thead><tr><th>Date</th><th>Channel</th><th>Acres</th><th>Reason</th></tr></thead>
            <tbody>
              {acres.map((a, i) => (
                <tr key={i}>
                  <td>{new Date(a.created_at).toLocaleDateString()}</td>
                  <td>{a.channel}</td>
                  <td>+{a.amount}</td>
                  <td>{a.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
};

export default History;
