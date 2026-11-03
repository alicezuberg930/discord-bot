import { Controller, Get, Header, StreamableFile } from '@nestjs/common';
import { ExcelExportService } from './excel-export.service.js';

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller()
export class ExcelExportController {
  constructor(private readonly excelExportService: ExcelExportService) {}

  @Get('export-excel')
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
