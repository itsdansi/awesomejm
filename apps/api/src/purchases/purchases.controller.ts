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
  cancelPurchaseSchema,
  postPurchaseSchema,
  purchaseDraftSchema,
  purchasesQuerySchema,
} from '@awesomejm/contracts';
import { PurchasesService } from './purchases.service.js';
function parse<T>(
  schema: {
    safeParse: (
      v: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: { message: string }[] } };
  },
  data: unknown,
): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new BadRequestException(result.error.issues.map((i) => i.message));
  return result.data;
}
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}
  @Get() list(@Query() v: unknown) {
    return this.purchases.list(parse(purchasesQuerySchema, v));
  }
  @Get(':id') get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.purchases.get(id);
  }
  @Post('preview') preview(@Body() v: unknown) {
    return this.purchases.preview(parse(purchaseDraftSchema, v));
  }
  @Post() post(@Body() v: unknown) {
    return this.purchases.post(parse(postPurchaseSchema, v));
  }
  @Post(':id/cancel') cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() v: unknown,
  ) {
    return this.purchases.cancel(id, parse(cancelPurchaseSchema, v));
  }
}
