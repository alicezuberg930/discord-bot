import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ExportAuthService,
  readCookie,
  SESSION_COOKIE,
} from './export-auth.service.js';

/**
 * Requires a valid admin session cookie. When no login is configured the
 * admin routes behave as if they do not exist.
 */
@Injectable()
export class ExportSessionGuard implements CanActivate {
  constructor(private readonly exportAuthService: ExportAuthService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.exportAuthService.isEnabled()) {
      throw new NotFoundException();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const username = this.exportAuthService.verifySessionToken(
      readCookie(request, SESSION_COOKIE),
    );

    if (!username) {
      throw new UnauthorizedException(
        'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
      );
    }

    return true;
  }
}
