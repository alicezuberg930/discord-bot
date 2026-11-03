import { ExcelExportController } from './excel-export.controller.js';
import { ExcelExportService } from './excel-export.service.js';

describe('ExcelExportController', () => {
  it('returns the workbook as a downloadable XLSX attachment', async () => {
    const workbook = Buffer.from('xlsx-data');
    const service = {
      createUsersWorkbook: vi.fn().mockResolvedValue(workbook),
    } as unknown as ExcelExportService;
    const controller = new ExcelExportController(service);

    const response = await controller.exportUsers();

    expect(response.getHeaders()).toEqual({
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="users-export.xlsx"',
      length: workbook.length,
    });
  });
});
