import { useAuth } from '../auth/AuthContext';
import type { ReactNode } from 'react';
import { Icon } from './ui';

export function AppShell({
  section,
  children,
}: {
  section:
    | 'Inventory'
    | 'Metal rates'
    | 'Customers'
    | 'Sales'
    | 'Orders'
    | 'Purchases'
    | 'Reports'
    | 'Dashboard'
    | 'Account'
    | 'Staff & recovery';
  children: ReactNode;
}) {
  const { user, can, logout } = useAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#/dashboard" aria-label="AwesomeJM home">
          <span className="brand-mark">
            <Icon name="diamond" size={23} />
          </span>
          <span>
            awesome<span className="brand-light">jm</span>
            <small>JEWELLERY MANAGER</small>
          </span>
        </a>
        <div className="shop-switch">
          <span className="shop-avatar">S</span>
          <div>
            <strong>{user.shopName}</strong>
            <small>{user.role.toLowerCase()} access</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {(
            [
              {
                name: 'Dashboard',
                path: 'dashboard',
                icon: 'overview',
                index: '00',
              },
              {
                name: 'Inventory',
                path: 'inventory',
                icon: 'box',
                index: '01',
              },
              {
                name: 'Metal rates',
                path: 'rates',
                icon: 'diamond',
                index: '02',
              },
              {
                name: 'Customers',
                path: 'customers',
                icon: 'users',
                index: '03',
              },
              { name: 'Sales', path: 'sales', icon: 'receipt', index: '04' },
              { name: 'Orders', path: 'orders', icon: 'box', index: '05' },
              {
                name: 'Purchases',
                path: 'purchases',
                icon: 'exchange',
                index: '06',
              },
              { name: 'Reports', path: 'reports', icon: 'chart', index: '07' },
            ] as const
          ).map((item) => (
            <a
              key={item.path}
              href={`#/${item.path}`}
              className={`nav-item ${section === item.name ? 'active' : ''}`}
              aria-current={section === item.name ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              {item.name}
              <span>{item.index}</span>
            </a>
          ))}
          {can('staff.manage') && (
            <a
              className={`nav-item ${section === 'Staff & recovery' ? 'active' : ''}`}
              href="#/staff"
            >
              <Icon name="users" />
              Staff & recovery<span>08</span>
            </a>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="tiny-diamond">◇</span>
          <p>
            Made for your everyday craft.<small>सुनचाँदी व्यवसायको लागि</small>
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb-separator">/</span>
            <strong>{section}</strong>
          </span>
          <div className="staff-topbar">
            <a className="text-button" href="#/account">
              {user.name} · {user.role.toLowerCase()}
            </a>
            <button className="text-button" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </header>
        <main className="workspace">
          {children}
          <footer>
            <span>
              AWESOMEJM <span className="footer-dot">·</span> Care in every
              detail.
            </span>
            <span>NPR · Nepal time (NPT)</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
