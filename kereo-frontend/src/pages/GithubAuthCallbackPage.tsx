import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import type { AuthUser } from '../lib/api';

export function GithubAuthCallbackPage() {
  const location = useLocation();
  const { user, setSession } = useAuth();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');

    if (!token || !userParam) {
      return;
    }

    try {
      const normalized = userParam.replace(/-/g, '+').replace(/_/g, '/');
      const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
      const parsedUser = JSON.parse(
        atob(`${normalized}${padding}`),
      ) as AuthUser;
      setSession(token, parsedUser);
    } catch {
      window.location.href = '/login?github=error';
    }
  }, [location.search, setSession]);

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
      <div className="spinner" style={{ width: 28, height: 28 }} />
    </div>
  );
}
