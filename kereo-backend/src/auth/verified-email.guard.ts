import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.user?.isEmailVerified) {
      return true;
    }

    throw new ForbiddenException(
      'Email verification is required before performing this action',
    );
  }
}
