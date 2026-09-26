import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '../decorators/current-user.decorator';

/**
 * The admin API needs more than a signed-in admin: the token must carry a
 * recent code from the authenticator app. A stolen password, email inbox or
 * token alone cannot change or delete anything.
 */
@Injectable()
export class AdminMfaGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const until = request.user?.mfaUntil;
    if (until && until * 1000 > Date.now()) return true;
    throw new ForbiddenException(
      'Enter the code from your authenticator app to use the admin panel.',
    );
  }
}
