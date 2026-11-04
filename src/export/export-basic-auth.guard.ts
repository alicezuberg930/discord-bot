import { createHash, timingSafeEqual } from 'node:crypto';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { EnvironmentVariables } from '../config/environment.js';

/** Failed logins allowed per client IP within the window before blocking. */
export const MAX_FAILED_ATTEMPTS = 10;
export const FAILED_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const REALM = 'Discord bot export';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time comparison that does not leak the expected value's length. */
function safeEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(sha256(actual), sha256(expected));
}

/**
 * HTTP Basic authentication for the user export. The browser shows its own
 * login dialog; credentials come from EXPORT_USERNAME / EXPORT_PASSWORD. When
 * they are not configured the endpoint behaves as if it does not exist.
 */
@Injectable()
export class ExportBasicAuthGuard implements CanActivate {
  private readonly logger = new Logger(ExportBasicAuthGuard.name);
  private readonly failedAttempts = new Map<
    string,
    { count: number; firstAt: number }
  >();

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const username = this.configService.get('EXPORT_USERNAME', {
      infer: true,
    });
    const password = this.configService.get('EXPORT_PASSWORD', {
      infer: true,
    });

    if (!username || !password) {
      throw new NotFoundException();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const clientIp = this.getClientIp(request);

    if (this.isBlocked(clientIp)) {
      throw new HttpException(
        'Too many failed login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const credentials = this.parseBasicAuth(request.headers.authorization);
    // Evaluate both comparisons so the response time does not reveal which
    // part was wrong.
    const usernameMatches = safeEqual(credentials?.username ?? '', username);
    const passwordMatches = safeEqual(credentials?.password ?? '', password);

    if (credentials && usernameMatches && passwordMatches) {
      this.failedAttempts.delete(clientIp);
      this.logger.log(`User export downloaded from ${clientIp}`);
      return true;
    }

    if (credentials) {
      this.recordFailure(clientIp);
      this.logger.warn(`Failed export login from ${clientIp}`);
    }

    response.setHeader(
      'WWW-Authenticate',
      `Basic realm="${REALM}", charset="UTF-8"`,
    );
    throw new UnauthorizedException('Login required');
  }

  private parseBasicAuth(
    header: string | undefined,
  ): { username: string; password: string } | null {
    const match = header?.match(/^Basic\s+([A-Za-z0-9+/=]+)\s*$/i);

    if (!match) {
      return null;
    }

    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = decoded.indexOf(':');

    if (separator < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  }

  /**
   * Behind IIS/ARR the real client is the last X-Forwarded-For entry (ARR
   * appends it); earlier entries can be forged by the client.
   */
  private getClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'];
    const value = Array.isArray(forwarded) ? forwarded.at(-1) : forwarded;
    const last = value?.split(',').at(-1)?.trim();

    return last || request.socket.remoteAddress || 'unknown';
  }

  private isBlocked(clientIp: string): boolean {
    const entry = this.failedAttempts.get(clientIp);

    if (!entry) {
      return false;
    }

    if (Date.now() - entry.firstAt > FAILED_ATTEMPT_WINDOW_MS) {
      this.failedAttempts.delete(clientIp);
      return false;
    }

    return entry.count >= MAX_FAILED_ATTEMPTS;
  }

  private recordFailure(clientIp: string): void {
    const now = Date.now();
    const entry = this.failedAttempts.get(clientIp);

    if (!entry || now - entry.firstAt > FAILED_ATTEMPT_WINDOW_MS) {
      this.failedAttempts.set(clientIp, { count: 1, firstAt: now });
      return;
    }

    entry.count += 1;
  }
}
