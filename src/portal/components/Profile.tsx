import React, { useState } from 'react';

interface User { id: string; name: string | null; email: string | null; birthday: string | null; }

interface Props {
  user: User & { phone: string };
  onUpdate: (id: string) => void;
}

const Profile: React.FC<Props> = ({ user, onUpdate }) => {
  const [form, setForm] = useState({
    name: user.name || '',
    email: user.email || '',
    birthday: user.birthday || '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/customers/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      onUpdate(user.id);
      alert('Profile updated!');
    } catch {
      alert('Save failed');
    }
    setSaving(false);
  };

  return (
    <div className="card">
      <h3>Edit Profile</h3>

      <label>Phone (cannot change)</label>
      <input value={user.phone} disabled style={{ background: '#f5f5f5' }} />

      <label style={{ marginTop: 16, display: 'block' }}>Name</label>
      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />

      <label style={{ marginTop: 16, display: 'block' }}>Email</label>
      <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />

      <label style={{ marginTop: 16, display: 'block' }}>Birthday (YYYY-MM-DD)</label>
      <input value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })} placeholder="1990-05-14" />

      <button onClick={save} disabled={saving} style={{ marginTop: 20 }}>{saving ? 'Saving...' : 'Save Changes'}</button>
    </div>
  );
};

export default Profile;
