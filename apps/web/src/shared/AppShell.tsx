import { roleKeys, navigationKeys } from '../i18n/labels';
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
          aria-label={t('common.labels.awesomejmHome')}
        >
          <span className="brand-mark">
            <Icon name="diamond" size={23} />
          </span>
          <span>
            {t('common.labels.awesome')}
            <span className="brand-light">{t('common.labels.jm')}</span>
            <small>{t('common.labels.jewelleryManager')}</small>
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
        <p className="nav-label">{t('common.labels.workspace')}</p>
        <nav aria-label={t('common.labels.mainNavigation')}>
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
              {t(navigationKeys[item.name])}
              <span>{item.index}</span>
            </a>
          ))}
          {can('staff.manage') && (
            <a
              className={`nav-item ${section === 'Staff & recovery' ? 'active' : ''}`}
              href="#/staff"
            >
              <Icon name="users" />
              {t('common.navigation.staff')}
              <span>08</span>
            </a>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="tiny-diamond">◇</span>
          <p>
            {t('common.labels.madeForYourEverydayCraft')}
            <small>{t('common.labels.forGoldAndSilverBusinesses')}</small>
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            {t('common.navigation.workspace') + ' '}
            <span className="breadcrumb-separator">/</span>
            <strong>{t(navigationKeys[section])}</strong>
          </span>
          <div className="staff-topbar">
            <LanguageSwitch />
            <a className="text-button" href="#/account">
              {user.name} · {t(roleKeys[user.role])}
            </a>
            <button className="text-button" onClick={() => void logout()}>
              {t('common.actions.signOut')}
            </button>
          </div>
        </header>
        <main className="workspace">
          {children}
          <footer>
            <span>
              {t('common.labels.awesomejm') + ' '}
              <span className="footer-dot">·</span>{' '}
              {' ' + t('common.labels.careInEveryDetail')}
            </span>
            <span>{t('common.labels.nprNepalTimeNpt')}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
