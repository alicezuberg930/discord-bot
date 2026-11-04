import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { EnvironmentVariables } from '../config/environment.js';

export const SESSION_COOKIE = 'export_session';
/** The cookie is only sent to the admin page and its API. */
export const SESSION_COOKIE_PATH = '/export-excel';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Failed logins allowed per client IP within the window before blocking. */
export const MAX_FAILED_ATTEMPTS = 10;
export const FAILED_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export type LoginResult = 'ok' | 'invalid' | 'blocked';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time comparison that does not leak the expected value's length. */
function safeEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(sha256(actual), sha256(expected));
}

/**
 * Behind IIS/ARR the real client is the last X-Forwarded-For entry (ARR
 * appends it); earlier entries can be forged by the client.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  const value = Array.isArray(forwarded) ? forwarded.at(-1) : forwarded;
  const last = value?.split(',').at(-1)?.trim();

  return last || request.socket.remoteAddress || 'unknown';
}

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of request.headers.cookie?.split(';') ?? []) {
    const separator = part.indexOf('=');

    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }

  return undefined;
}

const COOKIE_ATTRIBUTES = `Path=${SESSION_COOKIE_PATH}; HttpOnly; Secure; SameSite=Strict`;

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_TTL_MS / 1000}; ${COOKIE_ATTRIBUTES}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Max-Age=0; ${COOKIE_ATTRIBUTES}`;
}

/**
 * Login for the admin page (credentials from EXPORT_USERNAME /
 * EXPORT_PASSWORD). A successful login gets a signed session cookie.
 */
@Injectable()
export class ExportAuthService {
  private readonly logger = new Logger(ExportAuthService.name);
  // Sessions are signed with a key that only lives in this process, so a
  // restart or deploy simply asks the admin to log in again.
  private readonly sessionKey = randomBytes(32);
  private readonly failedAttempts = new Map<
    string,
    { count: number; firstAt: number }
  >();

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  isEnabled(): boolean {
    return this.credentials() !== null;
  }

  login(
    clientIp: string,
    username: string,
    password: string,
    now = Date.now(),
  ): LoginResult {
    const credentials = this.credentials();

    if (!credentials) {
      return 'invalid';
    }

    if (this.isBlocked(clientIp, now)) {
      this.logger.warn(`Blocked export login from ${clientIp}`);
      return 'blocked';
    }

    // Evaluate both comparisons so the response time does not reveal which
    // part was wrong.
    const usernameMatches = safeEqual(username, credentials.username);
    const passwordMatches = safeEqual(password, credentials.password);

    if (usernameMatches && passwordMatches) {
      this.failedAttempts.delete(clientIp);
      this.logger.log(`Export login accepted from ${clientIp}`);
      return 'ok';
    }

    this.recordFailure(clientIp, now);
    this.logger.warn(`Failed export login from ${clientIp}`);
    return 'invalid';
  }

  createSessionToken(username: string, now = Date.now()): string {
    const payload = `${Buffer.from(username, 'utf8').toString('base64url')}.${now + SESSION_TTL_MS}`;

    return `${payload}.${this.sign(payload)}`;
  }

  /** The logged-in username, or null for a missing/forged/expired session. */
  verifySessionToken(
    token: string | undefined,
    now = Date.now(),
  ): string | null {
    const credentials = this.credentials();
    const parts = token?.split('.') ?? [];

    if (!credentials || parts.length !== 3) {
      return null;
    }

    const [encodedUsername, expiresAt, signature] = parts;
    const payload = `${encodedUsername}.${expiresAt}`;

    if (!safeEqual(signature, this.sign(payload))) {
      return null;
    }

    if (!(Number(expiresAt) > now)) {
      return null;
    }

    const username = Buffer.from(encodedUsername, 'base64url').toString('utf8');

    return username === credentials.username ? username : null;
  }

  private credentials(): { username: string; password: string } | null {
    const username = this.configService.get('EXPORT_USERNAME', {
      infer: true,
    });
    const password = this.configService.get('EXPORT_PASSWORD', {
      infer: true,
    });

    return username && password ? { username, password } : null;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.sessionKey)
      .update(payload)
      .digest('base64url');
  }

  private isBlocked(clientIp: string, now: number): boolean {
    const entry = this.failedAttempts.get(clientIp);

    if (!entry) {
      return false;
    }

    if (now - entry.firstAt > FAILED_ATTEMPT_WINDOW_MS) {
      this.failedAttempts.delete(clientIp);
      return false;
    }

    return entry.count >= MAX_FAILED_ATTEMPTS;
  }

  private recordFailure(clientIp: string, now: number): void {
    const entry = this.failedAttempts.get(clientIp);

    if (!entry || now - entry.firstAt > FAILED_ATTEMPT_WINDOW_MS) {
      this.failedAttempts.set(clientIp, { count: 1, firstAt: now });
      return;
    }

    entry.count += 1;
  }
}
