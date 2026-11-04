import { firstValueFrom, take, toArray } from 'rxjs';
import { LiveUpdatesService } from '../live/live-updates.service.js';
import {
  ExcelExportController,
  LIVE_HEARTBEAT_MS,
} from './excel-export.controller.js';
import { ExcelExportService } from './excel-export.service.js';
import type { ExportAuthService } from './export-auth.service.js';
import { buildMemberOverview } from './member-overview.js';
import { MemberOverviewService } from './member-overview.service.js';

function overview(discordConnected: boolean) {
  return buildMemberOverview({
    now: new Date('2026-11-04T13:30:00Z'),
    discordConnected,
    guildName: 'Test Guild',
    members: discordConnected
      ? [
          {
            discordUserId: '1',
            username: 'milk',
            displayName: 'Milk',
            avatarUrl: null,
            joinedAt: new Date('2026-11-04T13:14:00Z'),
            roles: [],
          },
        ]
      : [],
    registeredUsers: [],
    verifiedRoleIds: ['verified-role'],
  });
}

function createController(discordConnected = true) {
  const workbook = Buffer.from('xlsx-data');
  const createUsersWorkbook = vi.fn().mockResolvedValue(workbook);
  const liveUpdates = new LiveUpdatesService();
  const controller = new ExcelExportController(
    { createUsersWorkbook } as unknown as ExcelExportService,
    {
      getOverview: vi.fn().mockResolvedValue(overview(discordConnected)),
    } as unknown as MemberOverviewService,
    { isEnabled: () => true } as unknown as ExportAuthService,
    liveUpdates,
  );
  const request = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };

  return { controller, createUsersWorkbook, workbook, request, liveUpdates };
}

describe('ExcelExportController', () => {
  it('returns the workbook as a downloadable XLSX attachment with the members sheet', async () => {
    const { controller, createUsersWorkbook, workbook, request } =
      createController();

    const response = await controller.exportUsers(request as never);

    expect(response.getHeaders()).toEqual({
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="users-export.xlsx"',
      length: workbook.length,
    });
    expect(createUsersWorkbook).toHaveBeenCalledWith([
      expect.objectContaining({ username: 'milk', status: 'unverified' }),
    ]);
  });

  it('still exports the users sheet when Discord is not connected', async () => {
    const { controller, createUsersWorkbook, request } =
      createController(false);

    await controller.exportUsers(request as never);

    expect(createUsersWorkbook).toHaveBeenCalledWith(undefined);
  });

  it('returns the member overview as data for the admin page', async () => {
    const { controller } = createController();

    const data = await controller.overview();

    expect(data.counts).toMatchObject({ total: 1, unverified: 1 });
  });

  describe('live events', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('says ready right away, then forwards every change', async () => {
      const { controller, liveUpdates } = createController();
      const events = firstValueFrom(
        controller.events().pipe(take(3), toArray()),
      );

      liveUpdates.notify('member-joined');
      liveUpdates.notify('verification-submitted');

      expect((await events).map((event) => event.type)).toEqual([
        'ready',
        'change',
        'change',
      ]);
      expect((await events)[1].data).toMatchObject({ reason: 'member-joined' });
      expect((await events)[2].data).toMatchObject({
        reason: 'verification-submitted',
      });
    });

    it('sends a heartbeat so proxies keep the stream open', async () => {
      vi.useFakeTimers();
      const { controller } = createController();
      const events = firstValueFrom(
        controller.events().pipe(take(2), toArray()),
      );

      await vi.advanceTimersByTimeAsync(LIVE_HEARTBEAT_MS);

      expect((await events).map((event) => event.type)).toEqual([
        'ready',
        'ping',
      ]);
    });
  });
});
