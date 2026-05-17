import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { VerificationBanner } from './VerificationBanner';
import './AppLayout.css';

export function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <VerificationBanner />
        <Outlet />
      </main>
    </div>
  );
}
