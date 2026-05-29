import React, { useState } from 'react';
import PhoneLookup from './components/PhoneLookup';
import CustomerCard from './components/CustomerCard';
import RedeemModal from './components/RedeemModal';

interface CustomerData {
  customer: any;
  tier: string;
  lifetime_acres: number;
  available_rewards: Array<{ reward_type: string; label: string; available: boolean }>;
}

const StaffApp: React.FC = () => {
  const [customerData, setCustomerData] = useState<CustomerData | null>(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [selectedReward, setSelectedReward] = useState<{ reward_type: string; label: string } | null>(null);

  const handleLookup = async (inputPhone: string) => {
    setLoading(true);
    setError('');
    setSuccess('');
    setCustomerData(null);

    try {
      const res = await fetch(`/api/staff/lookup?phone=${encodeURIComponent(inputPhone)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Customer not found');
      }
      const data = await res.json();
      setCustomerData(data);
      setPhone(inputPhone);
    } catch (e: any) {
      setError(e.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const openRedeem = (reward: { reward_type: string; label: string }) => {
    setSelectedReward(reward);
    setShowRedeemModal(true);
  };

  const handleRedeem = async () => {
    if (!customerData || !selectedReward) return;

    try {
      const res = await fetch('/api/staff/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerData.customer.id,
          reward_type: selectedReward.reward_type,
          staff_id: 'barista',
          channel: 'retail',
        }),
      });

      if (!res.ok) throw new Error('Redeem failed');

      setShowRedeemModal(false);
      setSuccess(`Reward redeemed: ${selectedReward.label}. Enjoy!`);
      
      // Refresh lookup
      setTimeout(() => {
        handleLookup(phone);
        setSuccess('');
      }, 1600);
    } catch (e) {
      alert('Redeem failed. Try again.');
    }
  };

  const reset = () => {
    setCustomerData(null);
    setPhone('');
    setError('');
    setSuccess('');
  };

  return (
    <div className="app">
      <div className="header">
        <h1>🌱 Plot Holders • Staff</h1>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>Hundred Acre Coffee</div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {!customerData ? (
          <PhoneLookup onSubmit={handleLookup} loading={loading} error={error} />
        ) : (
          <>
            <CustomerCard
              data={customerData}
              onRedeem={openRedeem}
              onReset={reset}
            />
            {success && <div className="success" style={{ marginTop: 16 }}>{success}</div>}
          </>
        )}
      </div>

      {showRedeemModal && selectedReward && (
        <RedeemModal
          rewardLabel={selectedReward.label}
          customerName={customerData?.customer?.name || customerData?.customer?.phone}
          onConfirm={handleRedeem}
          onCancel={() => setShowRedeemModal(false)}
        />
      )}

      <div style={{ textAlign: 'center', padding: 20, fontSize: 12, color: '#888' }}>
        Plot Holders Club — Staff Terminal
      </div>
    </div>
  );
};

export default StaffApp;
