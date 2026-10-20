import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Permission } from '@awesomejm/contracts';
import { AuthService, csrfToken } from './auth.service.js';
import {
  allowedOrigin,
  digestCookieName,
  requirePermission,
  type AuthRequest,
} from './policy.js';
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const targets = [context.getHandler(), context.getClass()];
    const mutate = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (
      mutate &&
      (!allowedOrigin(request.headers.origin) ||
        request.headers['x-awesomejm-request'] !== '1' ||
        !request.headers['content-type']?.startsWith('application/json'))
    )
      throw new ForbiddenException(
        'This request must come from the shop application.',
      );
    if (
      this.reflector.getAllAndOverride<boolean>('auth.public', targets) &&
      context.getHandler().name === 'getHealth'
    )
      return true;
    const cookie = request.headers.cookie ?? '';
    const token = cookie
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${digestCookieName()}=`))
      ?.slice(digestCookieName().length + 1);
    const user = token
      ? await this.auth.userForSession(
          token,
          context.getHandler().name !== 'session',
        )
      : null;
    if (user && token) {
      request.user = user;
      request.sessionToken = token;
    }
    if (this.reflector.getAllAndOverride<boolean>('auth.public', targets))
      return true;
    if (!user || !token)
      throw new UnauthorizedException('Sign in to continue.');
    if (mutate) {
      const supplied = request.headers['x-csrf-token'] ?? '';
      const expected = csrfToken(token);
      if (
        !/^[a-f0-9]{64}$/.test(supplied) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
      )
        throw new ForbiddenException(
          'Your session changed. Refresh the page and try again.',
        );
    }
    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>('auth.passwordChange', targets)
    )
      throw new ForbiddenException(
        'Change your temporary password before opening the workspace.',
      );
    const permission = this.reflector.getAllAndOverride<Permission>(
      'auth.permission',
      targets,
    );
    if (
      !permission &&
      !this.reflector.getAllAndOverride<boolean>('auth.passwordChange', targets)
    )
      throw new ForbiddenException(
        'No access policy is configured for this action.',
      );
    if (permission) requirePermission(user, permission);
    if (mutate && permission === 'staff.manage')
      await this.auth.requireRecentSignIn(token);
    return true;
  }
}
