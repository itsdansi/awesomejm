import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { staffContext } from './context.js';
import type { AuthRequest } from './policy.js';
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (!request.user) return next.handle();
    return new Observable((subscriber) =>
      staffContext.run({ actorId: request.user!.id }, () =>
        next.handle().subscribe(subscriber),
      ),
    );
  }
}
