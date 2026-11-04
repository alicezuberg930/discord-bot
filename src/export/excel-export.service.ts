import { Injectable } from '@nestjs/common';
import { utils, write } from 'xlsx';
import { PrismaService } from '../database/prisma.service.js';
import type { MemberStatus, OverviewMember } from './member-overview.js';

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

export const MEMBER_EXPORT_HEADERS = [
  'trang_thai',
  'moi_cu',
  'ten_hien_thi',
  'username',
  'discordUserId',
  'vai_tro',
  'vao_server',
  'ten_tai_khoan',
  'xac_thuc_luc',
] as const;

const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  verified: 'Đã xác thực',
  'needs-role': 'Đã điền form, thiếu vai trò',
  unverified: 'Chưa xác thực',
};

type ExportCell = Date | number | string | null;

@Injectable()
export class ExcelExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sheet `users` holds the verification records; when Discord members are
   * given, sheet `thanh_vien` lists every member with status and roles.
   */
  async createUsersWorkbook(members?: OverviewMember[]): Promise<Buffer> {
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

    if (members) {
      utils.book_append_sheet(
        workbook,
        this.createMembersSheet(members),
        'thanh_vien',
      );
    }

    const output = write(workbook, {
      bookType: 'xlsx',
      cellDates: true,
      compression: true,
      type: 'buffer',
    });

    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  }

  private createMembersSheet(members: OverviewMember[]) {
    const rows: ExportCell[][] = [
      [...MEMBER_EXPORT_HEADERS],
      ...members.map((member) => [
        MEMBER_STATUS_LABELS[member.status],
        member.isNew ? 'Mới' : 'Cũ',
        member.displayName,
        member.username,
        member.discordUserId,
        member.roles.map((role) => role.name).join(', '),
        member.joinedAt,
        member.accountName,
        member.verifiedAt,
      ]),
    ];
    const worksheet = utils.aoa_to_sheet(rows, {
      cellDates: true,
      dateNF: 'yyyy-mm-dd hh:mm:ss',
    });

    worksheet['!cols'] = [
      { wch: 26 },
      { wch: 8 },
      { wch: 24 },
      { wch: 22 },
      { wch: 23 },
      { wch: 40 },
      { wch: 22 },
      { wch: 24 },
      { wch: 22 },
    ];
    worksheet['!autofilter'] = { ref: `A1:I${members.length + 1}` };

    return worksheet;
  }
}
