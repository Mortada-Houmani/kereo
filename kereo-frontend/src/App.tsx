import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { AuthPage } from './pages/AuthPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { GithubAuthCallbackPage } from './pages/GithubAuthCallbackPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/auth/github/callback" element={<GithubAuthCallbackPage />} />
          <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<ProjectsPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
