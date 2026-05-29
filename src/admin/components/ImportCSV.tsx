import React, { useState } from 'react';

export default function ImportCSV() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const upload = async () => {
    if (!file) return;
    setLoading(true);
    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch('/api/qashier/import', { method: 'POST', body: fd });
    const json = await res.json();
    setResult(json);
    setLoading(false);

    // refresh history
    loadHistory();
  };

  const loadHistory = async () => {
    const res = await fetch('/api/qashier/imports');
    if (res.ok) {
      const j = await res.json();
      setHistory(j.data || []);
    }
  };

  React.useEffect(() => { loadHistory(); }, []);

  return (
    <div style={{ padding: 28 }}>
      <h1>Qashier CSV Import</h1>

      <div style={{ background: '#fff', padding: 24, borderRadius: 12, maxWidth: 620 }}>
        <p>Upload a Qashier export CSV. Expected columns: Date, Time, Receipt No, Items, Total, Payment Method, Customer Phone, Customer Name, Outlet.</p>

        <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} />
        <button disabled={!file || loading} onClick={upload} style={{ marginTop: 12, display: 'block' }}>
          {loading ? 'Importing...' : 'Upload & Import'}
        </button>

        {result && (
          <div style={{ marginTop: 20, padding: 16, background: '#f4f9f4', borderRadius: 8 }}>
            <strong>Import complete</strong><br />
            Processed: {result.rows_processed} | Matched: {result.rows_matched} | New: {result.rows_new} | Duplicates skipped: {result.duplicates_skipped}
            {result.errors?.length > 0 && <div style={{ color: '#c33', marginTop: 8 }}>{result.errors.length} errors logged.</div>}
          </div>
        )}
      </div>

      <div style={{ marginTop: 40 }}>
        <h3>Recent Imports</h3>
        <table style={{ background: '#fff', width: '100%', borderRadius: 8 }}>
          <thead><tr><th>Filename</th><th>Processed</th><th>New</th><th>When</th></tr></thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i}><td>{h.filename}</td><td>{h.rows_processed}</td><td>{h.rows_new}</td><td>{new Date(h.imported_at).toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
