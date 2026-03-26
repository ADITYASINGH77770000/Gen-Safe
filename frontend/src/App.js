import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Alerts from './pages/Alerts';
import AlertDetail from './pages/AlertDetail';
import Invoices from './pages/Invoices';
import Suppliers from './pages/Suppliers';
import Tasks from './pages/Tasks';
import AuditTrail from './pages/AuditTrail';
import OpsCenter from './pages/OpsCenter';
import Layout from './components/common/Layout';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="alerts/:id" element={<AlertDetail />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="audit" element={<AuditTrail />} />
          <Route path="ops-center" element={<OpsCenter />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
