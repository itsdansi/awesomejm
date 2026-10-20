import { RequirePermission } from '../auth/policy.js';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import {
  publishRateSchema,
  rateHistoryQuerySchema,
  rateQuerySchema,
} from '@awesomejm/contracts';
import { RatesService } from './rates.service.js';

@Controller('rates')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @RequirePermission('workspace.read')
  @Get()
  book(@Query() query: unknown) {
    const parsed = rateQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    return this.rates.book(parsed.data);
  }
  @RequirePermission('workspace.read')
  @Get('history')
  history(@Query() query: unknown) {
    const parsed = rateHistoryQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    return this.rates.history(parsed.data);
  }
  @RequirePermission('rates.write')
  @Post()
  publish(@Body() body: unknown) {
    const parsed = publishRateSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`,
        ),
      );
    return this.rates.publish(parsed.data);
  }
}
