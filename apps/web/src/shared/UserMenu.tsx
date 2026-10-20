import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useAuth } from '../auth/AuthContext';
import { roleKeys } from '../i18n/labels';
import { locale, t, useLanguage } from '../i18n/language';
import { Icon } from './ui';

export function UserMenu() {
  useLanguage();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const initialFocus = useRef<'first' | 'last'>('first');
  const words = (user.name.trim() || user.username).split(/\s+/u);
  const segmenter = new Intl.Segmenter(locale(), { granularity: 'grapheme' });
  const initials = [words[0], ...(words.length > 1 ? [words.at(-1)] : [])]
    .map((word) => [...segmenter.segment(word ?? '')][0]?.segment ?? '')
    .join('')
    .toLocaleUpperCase(locale());

  useEffect(() => {
    if (!open) return;
    items.current[
      initialFocus.current === 'last' ? items.current.length - 1 : 0
    ]?.focus();
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('click', dismiss);
    document.addEventListener('focusin', dismiss);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('click', dismiss);
      document.removeEventListener('focusin', dismiss);
    };
  }, [open]);

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const current = items.current.findIndex(
      (item) => item === document.activeElement,
    );
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (current + 1) % items.current.length;
        break;
      case 'ArrowUp':
        next = (current - 1 + items.current.length) % items.current.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.current.length - 1;
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      case 'Tab':
        close(true);
        return;
      case ' ':
        event.preventDefault();
        items.current[current]?.click();
        return;
      default:
        return;
    }
    event.preventDefault();
    items.current[next]?.focus();
  }

  return (
    <div className="user-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="user-avatar"
        aria-label={t('auth.userMenu.open', { name: user.name })}
        title={t('auth.userMenu.open', { name: user.name })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          initialFocus.current = 'first';
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
            setOpen(true);
          }
        }}
      >
        <span aria-hidden="true">{initials}</span>
      </button>
      {open && (
        <div
          id={id}
          className="user-menu-panel"
          role="menu"
          aria-label={t('auth.userMenu.label')}
          onKeyDown={navigate}
        >
          <div className="user-menu-identity" role="none">
            <strong>{user.name}</strong>
            <span>{t(roleKeys[user.role])}</span>
          </div>
          <a
            ref={(element) => {
              items.current[0] = element;
            }}
            href="#/account"
            role="menuitem"
            tabIndex={-1}
            className="user-menu-item"
            onClick={() => close()}
          >
            <Icon name="user" size={18} />
            {t('auth.userMenu.account')}
          </a>
          <a
            ref={(element) => {
              items.current[1] = element;
            }}
            href="#/settings"
            role="menuitem"
            tabIndex={-1}
            className="user-menu-item"
            onClick={() => close()}
          >
            <Icon name="settings" size={18} />
            {t('settings.title')}
          </a>
          <button
            ref={(element) => {
              items.current[2] = element;
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="user-menu-item"
            onClick={() => {
              close();
              void logout();
            }}
          >
            <Icon name="logout" size={18} />
            {t('common.actions.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
