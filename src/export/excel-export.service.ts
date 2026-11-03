import { Injectable } from '@nestjs/common';
import { utils, write } from 'xlsx';
import { PrismaService } from '../database/prisma.service.js';

export const USER_EXPORT_HEADERS = [
  'id',
  'account_name',
  'phone',
  'cccd',
  'guildId',
  'discordUserId',
  'email',
  'created_at',
  'update_at',
] as const;

type ExportCell = Date | number | string | null;

@Injectable()
export class ExcelExportService {
  constructor(private readonly prisma: PrismaService) {}

  async createUsersWorkbook(): Promise<Buffer> {
    const users = await this.prisma.user.findMany({
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

    const rows: ExportCell[][] = [
      [...USER_EXPORT_HEADERS],
      ...users.map((user) => [
        user.id,
        user.accountName,
        user.phone,
        user.cccd,
        user.guildId,
        user.discordUserId,
        user.email,
        user.createdAt,
        user.updatedAt,
      ]),
    ];
    const worksheet = utils.aoa_to_sheet(rows, {
      cellDates: true,
      dateNF: 'yyyy-mm-dd hh:mm:ss',
    });

    worksheet['!cols'] = [
      { wch: 10 },
      { wch: 24 },
      { wch: 18 },
      { wch: 20 },
      { wch: 23 },
      { wch: 23 },
      { wch: 32 },
      { wch: 22 },
      { wch: 22 },
    ];
    worksheet['!autofilter'] = {
      ref: `A1:I${Math.max(users.length + 1, 1)}`,
    };

    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'users');

    const output = write(workbook, {
      bookType: 'xlsx',
      cellDates: true,
      compression: true,
      type: 'buffer',
    });

    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  }
}
