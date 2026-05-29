import React from 'react';

interface Props {
  rewardLabel: string;
  customerName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const RedeemModal: React.FC<Props> = ({ rewardLabel, customerName, onConfirm, onCancel }) => {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 28, width: '90%', maxWidth: 360,
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Confirm Redemption</div>
        <div style={{ color: '#555', marginBottom: 20 }}>
          Give <strong>{rewardLabel}</strong> to <strong>{customerName}</strong>?
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onCancel} style={{ background: '#eee', color: '#333', flex: 1 }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1 }}>Confirm Redeem</button>
        </div>
      </div>
    </div>
  );
};

export default RedeemModal;
