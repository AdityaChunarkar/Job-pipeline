import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './auth';
import type { Role } from './api';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Landing from './pages/Landing';
import { Login, Register } from './pages/AuthPages';
import Jobs from './pages/Jobs';
import JobDetail from './pages/JobDetail';
import MyApplications from './pages/MyApplications';
import EmployerDashboard from './pages/EmployerDashboard';
import JobForm from './pages/JobForm';
import Applicants from './pages/Applicants';
import Notifications from './pages/Notifications';

function Protected({ role, children }: { role?: Role; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'EMPLOYER' ? '/employer' : '/applications'} replace />;
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/applications" element={<Protected role="CANDIDATE"><MyApplications /></Protected>} />
            <Route path="/employer" element={<Protected role="EMPLOYER"><EmployerDashboard /></Protected>} />
            <Route path="/employer/jobs/new" element={<Protected role="EMPLOYER"><JobForm /></Protected>} />
            <Route path="/employer/jobs/:id/edit" element={<Protected role="EMPLOYER"><JobForm /></Protected>} />
            <Route path="/employer/jobs/:id/applicants" element={<Protected role="EMPLOYER"><Applicants /></Protected>} />
            <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
            <Route path="*" element={<p className="py-16 text-center text-slate-500">Page not found.</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
