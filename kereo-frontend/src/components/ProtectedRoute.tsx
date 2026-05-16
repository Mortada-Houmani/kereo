import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    );
  }
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
