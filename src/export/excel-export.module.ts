import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { ExcelExportController } from './excel-export.controller.js';
import { ExcelExportService } from './excel-export.service.js';
import { ExportBasicAuthGuard } from './export-basic-auth.guard.js';

@Module({
  imports: [PrismaModule],
  controllers: [ExcelExportController],
  providers: [ExcelExportService, ExportBasicAuthGuard],
})
export class ExcelExportModule {}
