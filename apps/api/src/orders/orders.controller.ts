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
  createOrderSchema,
  orderPaymentSchema,
  ordersQuerySchema,
  updateOrderStatusSchema,
} from '@awesomejm/contracts';
import { OrdersService } from './orders.service.js';
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
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get() list(@Query() query: unknown) {
    return this.orders.list(parse(ordersQuerySchema, query));
  }
  @Get('summary') summary() {
    return this.orders.summary();
  }
  @Get(':id') get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.get(id);
  }
  @Post() create(@Body() body: unknown) {
    return this.orders.create(parse(createOrderSchema, body));
  }
  @Post(':id/status') status(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.orders.updateStatus(id, parse(updateOrderStatusSchema, body));
  }
  @Post(':id/payments') payment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.orders.payment(id, parse(orderPaymentSchema, body));
  }
}
