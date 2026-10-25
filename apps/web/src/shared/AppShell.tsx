import { roleKeys, navigationKeys } from '../i18n/labels';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { t, useLanguage } from '../i18n/language';
import { useAuth } from '../auth/AuthContext';
import type { ReactNode } from 'react';
import { Icon } from './ui';
import { UserMenu } from './UserMenu';
import type { AppSection } from './routes';

export function AppShell({
  section,
  children,
  busy = false,
}: {
  section: AppSection;
  busy?: boolean;
  children: ReactNode;
}) {
  useLanguage();

  const { user, can } = useAuth();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#/dashboard"
          aria-label={t('common.labels.awesomejmHome')}
        >
          <span className="brand-mark">
            <Icon name="diamond" size={23} />
          </span>
          <span>
            {t('common.labels.awesome')}
            <span className="brand-light">{t('common.labels.jm')}</span>
          </span>
        </a>
        <div className="shop-switch">
          <span className="shop-avatar">{t('common.labels.s')}</span>
          <div>
            <strong>{user.shopName}</strong>
            <small>
              {t(roleKeys[user.role])} {' ' + t('common.labels.access')}
            </small>
          </div>
        </div>
        <nav aria-label={t('common.labels.mainNavigation')}>
          {(
            [
              {
                name: 'Dashboard',
                path: 'dashboard',
                icon: 'overview',
              },
              {
                name: 'Inventory',
                path: 'inventory',
                icon: 'box',
              },
              {
                name: 'Metal rates',
                path: 'rates',
                icon: 'diamond',
              },
              {
                name: 'Customers',
                path: 'customers',
                icon: 'users',
              },
              { name: 'Sales', path: 'sales', icon: 'receipt' },
              { name: 'Orders', path: 'orders', icon: 'box' },
              {
                name: 'Purchases',
                path: 'purchases',
                icon: 'exchange',
              },
              { name: 'Reports', path: 'reports', icon: 'chart' },
            ] as const
          ).map((item) => (
            <a
              key={item.path}
              href={`#/${item.path}`}
              className={`nav-item ${section === item.name ? 'active' : ''}`}
              aria-current={section === item.name ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              {t(navigationKeys[item.name])}
            </a>
          ))}
          {can('staff.manage') && (
            <a
              className={`nav-item ${section === 'Staff & recovery' ? 'active' : ''}`}
              href="#/staff"
              aria-current={section === 'Staff & recovery' ? 'page' : undefined}
            >
              <Icon name="users" />
              {t('common.navigation.staff')}
            </a>
          )}
        </nav>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="current-section">{t(navigationKeys[section])}</span>
          <div className="staff-topbar">
            <LanguageSwitch />
            <UserMenu />
          </div>
        </header>
        <main className="workspace" aria-busy={busy}>
          {children}
        </main>
      </div>
    </div>
  );
}
