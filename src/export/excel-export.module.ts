import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { DiscordModule } from '../discord/discord.module.js';
import { LiveUpdatesModule } from '../live/live-updates.module.js';
import { VerificationModule } from '../verification/verification.module.js';
import { ExcelExportController } from './excel-export.controller.js';
import { ExcelExportService } from './excel-export.service.js';
import { ExportAuthService } from './export-auth.service.js';
import { ExportSessionGuard } from './export-session.guard.js';
import { MemberOverviewService } from './member-overview.service.js';

@Module({
  imports: [PrismaModule, DiscordModule, VerificationModule, LiveUpdatesModule],
  controllers: [ExcelExportController],
  providers: [
    ExcelExportService,
    ExportAuthService,
    ExportSessionGuard,
    MemberOverviewService,
  ],
})
export class ExcelExportModule {}
