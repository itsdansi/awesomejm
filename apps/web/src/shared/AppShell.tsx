import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { t, useLanguage } from '../i18n/language';
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
  useLanguage();

  const { user, can, logout } = useAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#/dashboard"
          aria-label={t('AwesomeJM home')}
        >
          <span className="brand-mark">
            <Icon name="diamond" size={23} />
          </span>
          <span>
            {t('awesome')}
            <span className="brand-light">{t('jm')}</span>
            <small>{t('JEWELLERY MANAGER')}</small>
          </span>
        </a>
        <div className="shop-switch">
          <span className="shop-avatar">{t('S')}</span>
          <div>
            <strong>{user.shopName}</strong>
            <small>
              {t(user.role)} {t(' access')}
            </small>
          </div>
        </div>
        <p className="nav-label">{t('WORKSPACE')}</p>
        <nav aria-label={t('Main navigation')}>
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
              {t(item.name)}
              <span>{item.index}</span>
            </a>
          ))}
          {can('staff.manage') && (
            <a
              className={`nav-item ${section === 'Staff & recovery' ? 'active' : ''}`}
              href="#/staff"
            >
              <Icon name="users" />
              {t('Staff & recovery')}
              <span>08</span>
            </a>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="tiny-diamond">◇</span>
          <p>
            {t('Made for your everyday craft.')}
            <small>{t('For gold and silver businesses')}</small>
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            {t('Workspace ')}
            <span className="breadcrumb-separator">/</span>
            <strong>{t(section)}</strong>
          </span>
          <div className="staff-topbar">
            <LanguageSwitch />
            <a className="text-button" href="#/account">
              {user.name} · {t(user.role)}
            </a>
            <button className="text-button" onClick={() => void logout()}>
              {t('Sign out')}
            </button>
          </div>
        </header>
        <main className="workspace">
          {children}
          <footer>
            <span>
              {t('AWESOMEJM ')}
              <span className="footer-dot">·</span>{' '}
              {t(' Care in every detail.')}
            </span>
            <span>{t('NPR · Nepal time (NPT)')}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
