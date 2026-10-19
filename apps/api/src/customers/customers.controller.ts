import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  accountPaymentSchema,
  createCustomerSchema,
  customerQuerySchema,
  ledgerQuerySchema,
  reverseAccountEntrySchema,
  updateCustomerSchema,
} from '@awesomejm/contracts';
import { CustomersService } from './customers.service.js';

// All business payloads are parsed here; the server resolves the shop identity.
function parse<T>(
  schema: {
    safeParse: (data: unknown) =>
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: { path: PropertyKey[]; message: string }[] };
        };
  },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map(
        (issue) => `${issue.path.map(String).join('.')}: ${issue.message}`,
      ),
    );
  return result.data;
}
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() list(@Query() query: unknown) {
    return this.customers.list(parse(customerQuerySchema, query));
  }
  @Get('summary') summary() {
    return this.customers.summary();
  }
  @Post() create(@Body() body: unknown) {
    return this.customers.create(parse(createCustomerSchema, body));
  }
  @Get(':id') detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.customers.detail(id);
  }
  @Patch(':id') update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.customers.update(id, parse(updateCustomerSchema, body));
  }
  @Get(':id/ledger') statement(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    return this.customers.statement(id, parse(ledgerQuerySchema, query));
  }
  @Post(':id/payments') post(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.customers.post(id, parse(accountPaymentSchema, body));
  }
  @Post(':id/entries/:entryId/reverse') reverse(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('entryId', new ParseUUIDPipe()) entryId: string,
    @Body() body: unknown,
  ) {
    return this.customers.reverse(
      id,
      entryId,
      parse(reverseAccountEntrySchema, body),
    );
  }
}
