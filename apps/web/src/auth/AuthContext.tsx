import { createContext, useContext } from 'react';
import type { CurrentStaff, Permission } from '@awesomejm/contracts';
export const AuthContext = createContext<{
  user: CurrentStaff;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Authentication is required.');
  return {
    ...value,
    can: (permission: Permission) =>
      value.user.permissions.includes(permission),
  };
}
