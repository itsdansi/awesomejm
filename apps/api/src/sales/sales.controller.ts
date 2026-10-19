import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  cancelSaleSchema,
  postSaleSchema,
  saleDraftSchema,
  salesQuerySchema,
} from '@awesomejm/contracts';
import { SalesService } from './sales.service.js';

function parse<T>(
  schema: {
    safeParse: (
      data: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: { message: string }[] } };
  },
  data: unknown,
): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((issue) => issue.message),
    );
  return result.data;
}
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}
  @Get() list(@Query() query: unknown) {
    return this.sales.list(parse(salesQuerySchema, query));
  }
  @Get('summary') summary() {
    return this.sales.summary();
  }
  @Get(':id') detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.sales.get(id);
  }
  @Post('preview') preview(@Body() body: unknown) {
    return this.sales.preview(parse(saleDraftSchema, body));
  }
  @Post() post(@Body() body: unknown) {
    return this.sales.post(parse(postSaleSchema, body));
  }
  @Post(':id/cancel') cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.sales.cancel(id, parse(cancelSaleSchema, body));
  }
}
