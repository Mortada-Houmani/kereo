import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div style={{ display: 'flex', minHeight: '100dvh' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
        <Outlet />
      </main>
    </div>
  );
}
