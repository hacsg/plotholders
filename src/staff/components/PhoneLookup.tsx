import React, { useState } from 'react';

interface Props {
  onSubmit: (phone: string) => void;
  loading: boolean;
  error: string;
}

const PhoneLookup: React.FC<Props> = ({ onSubmit, loading, error }) => {
  const [phone, setPhone] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.trim().length >= 6) {
      onSubmit(phone.trim());
    }
  };

  return (
    <div>
      <h2 style={{ margin: '8px 0 20px', fontSize: 22 }}>Customer Lookup</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="tel"
          inputMode="numeric"
          placeholder="Enter phone number (e.g. 9123 4567)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={loading || phone.trim().length < 6}>
          {loading ? 'Looking up...' : 'Find Plot Holder'}
        </button>
      </form>

      {error && (
        <div style={{ marginTop: 20, padding: 16, background: '#fee', borderRadius: 12, color: '#c0392b' }}>
          {error}
          <div style={{ fontSize: 13, marginTop: 8, opacity: 0.8 }}>Try a different number or add the customer in admin.</div>
        </div>
      )}

      <div style={{ marginTop: 32, fontSize: 13, color: '#777', lineHeight: 1.4 }}>
        Tip: Works with numbers like 91234567, +6591234567, or 65 9123 4567
      </div>
    </div>
  );
};

export default PhoneLookup;
