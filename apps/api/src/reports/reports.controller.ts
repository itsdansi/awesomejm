import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { reportsQuerySchema } from '@awesomejm/contracts';
import { ReportsService } from './reports.service.js';
@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get('reports') get(@Query() query: unknown) {
    const parsed = reportsQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    return this.reports.get(parsed.data);
  }
  @Get('dashboard') dashboard() {
    return this.reports.dashboard();
  }
}
