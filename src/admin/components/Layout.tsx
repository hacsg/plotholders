import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/customers', label: 'Customers' },
  { to: '/import', label: 'Qashier Import' },
  { to: '/birthdays', label: 'Birthdays' },
  { to: '/grandfather', label: 'Seed Regulars' },
  { to: '/settings', label: 'Settings' },
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: '#1c2b23', color: '#d4e5d9', padding: '24px 16px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 32, color: '#fff' }}>
          🌱 Plot Holders
        </div>
        <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 12, paddingLeft: 8 }}>ADMIN</div>
        {navItems.map((item) => {
          const active = location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to));
          return (
            <Link
              key={item.to}
              to={item.to}
              style={{
                display: 'block',
                padding: '10px 12px',
                marginBottom: 4,
                borderRadius: 8,
                color: active ? '#fff' : '#d4e5d9',
                background: active ? '#2f6f3e' : 'transparent',
                textDecoration: 'none',
                fontWeight: active ? 600 : 400,
              }}
            >
              {item.label}
            </Link>
          );
        })}
        <div style={{ marginTop: 40, fontSize: 11, opacity: 0.5, paddingLeft: 8 }}>
          Embedded in Shopify Admin
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
};

export default Layout;
