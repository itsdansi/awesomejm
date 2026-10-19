import type { ReactNode } from 'react';
import { Icon } from './ui';

export function AppShell({
  section,
  children,
}: {
  section: 'Inventory' | 'Metal rates';
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#/inventory" aria-label="AwesomeJM home">
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
            <strong>First shop</strong>
            <small>Single-shop workspace</small>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {(
            [
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
          <span className="workspace-chip">
            <span />
            Local workspace
          </span>
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
