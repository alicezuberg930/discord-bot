import { read, utils } from 'xlsx';
import { PrismaService } from '../database/prisma.service.js';
import {
  ExcelExportService,
  MEMBER_EXPORT_HEADERS,
  USER_EXPORT_HEADERS,
} from './excel-export.service.js';

describe('ExcelExportService', () => {
  it('exports users with database column names and preserves identifiers', async () => {
    const createdAt = new Date('2026-11-03T08:00:00.000Z');
    const updatedAt = new Date('2026-11-03T09:00:00.000Z');
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 7,
        accountName: 'Nguyễn Văn A',
        phone: '0912345678',
        cccd: '001234567890',
        guildId: '1566748386806468611',
        discordUserId: '1011129739210610188',
        email: 'member@example.com',
        createdAt,
        updatedAt,
      },
    ]);
    const prisma = {
      user: { findMany },
    } as unknown as PrismaService;
    const service = new ExcelExportService(prisma);

    const output = await service.createUsersWorkbook();
    const workbook = read(output, { cellDates: true, type: 'buffer' });
    const worksheet = workbook.Sheets.users;
    const rows = utils.sheet_to_json<ExportCell[]>(worksheet, {
      header: 1,
      raw: true,
    });

    expect(findMany).toHaveBeenCalledWith({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        accountName: true,
        phone: true,
        cccd: true,
        guildId: true,
        discordUserId: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(rows[0]).toEqual([...USER_EXPORT_HEADERS]);
    expect(rows[1]).toEqual([
      7,
      'Nguyễn Văn A',
      '0912345678',
      '001234567890',
      '1566748386806468611',
      '1011129739210610188',
      'member@example.com',
      createdAt,
      updatedAt,
    ]);
  });

  it('adds a thanh_vien sheet with the form answers of each member', async () => {
    const prisma = {
      user: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new ExcelExportService(prisma);
    const joinedAt = new Date('2026-11-04T13:14:00.000Z');
    const verifiedAt = new Date('2026-11-04T13:20:00.000Z');

    const output = await service.createUsersWorkbook([
      {
        discordUserId: '1011129739210610188',
        username: 'player_a',
        displayName: 'Player A',
        avatarUrl: null,
        joinedAt,
        isNew: true,
        status: 'verified',
        roles: [{ name: 'Đạo hữu', color: null }],
        accountName: 'Nguyễn Văn A',
        phone: '0912345678',
        cccd: '001234567890',
        verifiedAt,
      },
    ]);
    const workbook = read(output, { cellDates: true, type: 'buffer' });
    const rows = utils.sheet_to_json<ExportCell[]>(workbook.Sheets.thanh_vien, {
      header: 1,
      raw: true,
    });

    expect(rows[0]).toEqual([...MEMBER_EXPORT_HEADERS]);
    expect(rows[1]).toEqual([
      'Đã xác thực',
      'Mới',
      'Player A',
      'player_a',
      '1011129739210610188',
      'Đạo hữu',
      joinedAt,
      'Nguyễn Văn A',
      '0912345678',
      '001234567890',
      verifiedAt,
    ]);
  });
});

type ExportCell = Date | number | string;
