import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Req,
  Res,
  Sse,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { interval, map, merge, of, type Observable } from 'rxjs';
import { LiveUpdatesService } from '../live/live-updates.service.js';
import { ExcelExportService } from './excel-export.service.js';
import {
  clearedSessionCookie,
  ExportAuthService,
  getClientIp,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
} from './export-auth.service.js';
import { ExportSessionGuard } from './export-session.guard.js';
import type { MemberOverview } from './member-overview.js';
import { MemberOverviewService } from './member-overview.service.js';
import { readAdminPage } from './web-assets.js';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_LOGIN_FIELD_LENGTH = 200;
/** Keeps the event stream alive through proxies that drop idle connections. */
export const LIVE_HEARTBEAT_MS = 20_000;

interface LiveEvent {
  type: 'ready' | 'change' | 'ping';
  data: object;
}

function loginField(body: unknown, key: 'username' | 'password'): string {
  const value =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)[key]
      : undefined;

  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_LOGIN_FIELD_LENGTH
  ) {
    throw new BadRequestException('Vui lòng nhập tên đăng nhập và mật khẩu.');
  }

  return value;
}

/**
 * Admin page for members and the users Excel export. Everything except the
 * page shell and the login endpoint requires the EXPORT_USERNAME /
 * EXPORT_PASSWORD login.
 */
@Controller('export-excel')
export class ExcelExportController {
  private readonly logger = new Logger(ExcelExportController.name);

  constructor(
    private readonly excelExportService: ExcelExportService,
    private readonly memberOverviewService: MemberOverviewService,
    private readonly exportAuthService: ExportAuthService,
    private readonly liveUpdatesService: LiveUpdatesService,
  ) {}

  /** The React app; it shows the login form or the member list. */
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  page(): string {
    this.assertEnabled();
    return readAdminPage();
  }

  @Post('api/login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  login(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): { username: string } {
    this.assertEnabled();

    const username = loginField(body, 'username');
    const password = loginField(body, 'password');
    const result = this.exportAuthService.login(
      getClientIp(request),
      username,
      password,
    );

    if (result === 'blocked') {
      throw new HttpException(
        'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (result === 'invalid') {
      throw new UnauthorizedException('Sai tên đăng nhập hoặc mật khẩu.');
    }

    response.setHeader(
      'Set-Cookie',
      sessionCookie(this.exportAuthService.createSessionToken(username)),
    );
    return { username };
  }

  @Post('api/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) response: Response): void {
    response.setHeader('Set-Cookie', clearedSessionCookie());
  }

  @Get('api/session')
  @UseGuards(ExportSessionGuard)
  @Header('Cache-Control', 'no-store')
  session(@Req() request: Request): { username: string | null } {
    return {
      username: this.exportAuthService.verifySessionToken(
        readCookie(request, SESSION_COOKIE),
      ),
    };
  }

  @Get('api/overview')
  @UseGuards(ExportSessionGuard)
  @Header('Cache-Control', 'no-store')
  overview(): Promise<MemberOverview> {
    return this.memberOverviewService.getOverview();
  }

  /**
   * Server-Sent Events: `ready` once connected, `change` whenever members or
   * verifications change (the page then reloads /api/overview), `ping` as a
   * heartbeat.
   */
  @Sse('api/events')
  @UseGuards(ExportSessionGuard)
  events(): Observable<LiveEvent> {
    return merge(
      of<LiveEvent>({ type: 'ready', data: { at: new Date().toISOString() } }),
      this.liveUpdatesService.changes.pipe(
        map((change): LiveEvent => ({ type: 'change', data: change })),
      ),
      interval(LIVE_HEARTBEAT_MS).pipe(
        map((): LiveEvent => ({ type: 'ping', data: {} })),
      ),
    );
  }

  @Get('download')
  @UseGuards(ExportSessionGuard)
  @Header('Cache-Control', 'no-store')
  async exportUsers(@Req() request: Request): Promise<StreamableFile> {
    const overview = await this.memberOverviewService.getOverview();
    const workbook = await this.excelExportService.createUsersWorkbook(
      overview.discordConnected ? overview.members : undefined,
    );

    this.logger.log(`Users Excel downloaded from ${getClientIp(request)}`);

    return new StreamableFile(workbook, {
      type: XLSX_CONTENT_TYPE,
      disposition: 'attachment; filename="users-export.xlsx"',
      length: workbook.length,
    });
  }

  private assertEnabled(): void {
    if (!this.exportAuthService.isEnabled()) {
      throw new NotFoundException();
    }
  }
}
