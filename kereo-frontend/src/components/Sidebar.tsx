import { Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid, LogOut, Rocket, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Sidebar.css';

const nav = [
  { to: '/', icon: LayoutGrid, label: 'Projects' },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Rocket size={20} strokeWidth={2.2} style={{ color: 'var(--accent)' }} />
        <span className="sidebar-logo-text">Kereo</span>
      </div>

      <nav className="sidebar-nav">
        {nav.map(({ to, icon: Icon, label }) => {
          const active = pathname === to || (to !== '/' && pathname.startsWith(to));
          return (
            <Link key={to} to={to} className={`sidebar-link ${active ? 'active' : ''}`}>
              <Icon size={16} strokeWidth={2} />
              <span>{label}</span>
              {active && <ChevronRight size={12} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {user?.email?.charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-email">{user?.email}</span>
          </div>
        </div>
        <button className="sidebar-logout" onClick={logout} title="Logout">
          <LogOut size={15} strokeWidth={2} />
        </button>
      </div>
    </aside>
  );
}
