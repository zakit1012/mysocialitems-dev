import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { tap } from 'rxjs';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * One log line for every admin change - who, what, from where, and whether
 * it worked - so any change in the admin panel can be traced (pm2 logs).
 */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly log = new Logger('AdminAudit');

  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    if (req.method === 'GET') return next.handle();
    const who = `${req.user?.email ?? 'unknown'} ${req.method} ${req.originalUrl} from ${req.ip}`;
    return next.handle().pipe(
      tap({
        next: () => this.log.log(`${who} - done`),
        error: (err: unknown) =>
          this.log.warn(
            `${who} - failed: ${err instanceof Error ? err.message : String(err)}`,
          ),
      }),
    );
  }
}
