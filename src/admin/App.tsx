import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import CustomerList from './components/CustomerList';
import CustomerDetail from './components/CustomerDetail';
import ImportCSV from './components/ImportCSV';
import BirthdayList from './components/BirthdayList';
import Grandfather from './components/Grandfather';
import Layout from './components/Layout';

function App() {
  return (
    <BrowserRouter basename="/admin">
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers" element={<CustomerList />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/import" element={<ImportCSV />} />
          <Route path="/birthdays" element={<BirthdayList />} />
          <Route path="/grandfather" element={<Grandfather />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<div style={{ padding: 40 }}>Not found — <Link to="/">Go home</Link></div>} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

function Settings() {
  return (
    <div style={{ padding: 20 }}>
      <h2>Settings</h2>
      <div style={{ background: '#fff', padding: 24, borderRadius: 12, maxWidth: 520 }}>
        <p><strong>Tier thresholds (read-only for Phase 2)</strong></p>
        <ul>
          <li>Seedling → Grower: 10 acres</li>
          <li>Grower → Homesteader: 50 acres</li>
          <li>Homesteader → Landowner: 200 acres</li>
        </ul>
        <p style={{ color: '#666', fontSize: 13, marginTop: 20 }}>Shopify App status: <span style={{ color: '#2a7' }}>Connected (stub)</span></p>
      </div>
    </div>
  );
}

export default App;
