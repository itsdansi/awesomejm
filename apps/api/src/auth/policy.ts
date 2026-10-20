import { SetMetadata, ForbiddenException } from '@nestjs/common';
import type { CurrentStaff, Permission } from '@awesomejm/contracts';
export const Public = () => SetMetadata('auth.public', true);
export const AllowPasswordChange = () =>
  SetMetadata('auth.passwordChange', true);
export const RequirePermission = (permission: Permission) =>
  SetMetadata('auth.permission', permission);
export function requirePermission(user: CurrentStaff, permission: Permission) {
  if (!user.permissions.includes(permission))
    throw new ForbiddenException('Your staff role does not allow this action.');
}
export interface AuthRequest {
  method: string;
  headers: Record<string, string | undefined>;
  user?: CurrentStaff;
  sessionToken?: string;
  socket: { remoteAddress?: string };
}
export interface CookieResponse {
  setHeader(name: string, value: string): void;
}
export const digestCookieName = () =>
  process.env.NODE_ENV === 'production' ? '__Host-ajm_session' : 'ajm_session';
export function validateAccessConfig() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.DATABASE_URL)
      throw new Error('DATABASE_URL is required in production.');
    const origin = new URL(process.env.APP_ORIGIN ?? '');
    if (
      origin.protocol !== 'https:' ||
      origin.origin !== process.env.APP_ORIGIN
    )
      throw new Error(
        'APP_ORIGIN must be an exact HTTPS origin in production.',
      );
  }
}
export function allowedOrigin(origin: string | undefined) {
  const allowed = process.env.APP_ORIGIN
    ? [process.env.APP_ORIGIN]
    : ['http://127.0.0.1:5173', 'http://localhost:5173'];
  return origin === undefined || allowed.includes(origin);
}
