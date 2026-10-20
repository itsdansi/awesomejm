import type { ReactNode } from 'react';
import type { Permission as PermissionName } from '@awesomejm/contracts';
import { useAuth } from './AuthContext';
export function Permission({
  name,
  children,
}: {
  name: PermissionName;
  children: ReactNode;
}) {
  return useAuth().can(name) ? children : null;
}
