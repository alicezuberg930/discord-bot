import {
  Controller,
  Get,
  Header,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ExcelExportService } from './excel-export.service.js';
import { ExportBasicAuthGuard } from './export-basic-auth.guard.js';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller()
export class ExcelExportController {
  constructor(private readonly excelExportService: ExcelExportService) {}

  /** Requires the EXPORT_USERNAME / EXPORT_PASSWORD login (HTTP Basic). */
  @Get('export-excel')
  @UseGuards(ExportBasicAuthGuard)
  @Header('Cache-Control', 'no-store')
  async exportUsers(): Promise<StreamableFile> {
    const workbook = await this.excelExportService.createUsersWorkbook();

    return new StreamableFile(workbook, {
      type: XLSX_CONTENT_TYPE,
      disposition: 'attachment; filename="users-export.xlsx"',
      length: workbook.length,
    });
  }
}
