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

  @Get() book(@Query() query: unknown) {
    const parsed = rateQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    return this.rates.book(parsed.data);
  }
  @Get('history') history(@Query() query: unknown) {
    const parsed = rateHistoryQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    return this.rates.history(parsed.data);
  }
  @Post() publish(@Body() body: unknown) {
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
