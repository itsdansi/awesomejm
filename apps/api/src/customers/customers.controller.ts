import {
  requirePermission,
  type AuthRequest,
  RequirePermission,
} from '../auth/policy.js';
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
  Req,
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
  @RequirePermission('workspace.read')
  @Get()
  list(@Query() query: unknown) {
    return this.customers.list(parse(customerQuerySchema, query));
  }
  @RequirePermission('workspace.read')
  @Get('summary')
  summary() {
    return this.customers.summary();
  }
  @RequirePermission('customers.write')
  @Post()
  create(@Body() body: unknown, @Req() req: AuthRequest) {
    const input = parse(createCustomerSchema, body);
    if (input.openingType !== 'NONE')
      requirePermission(req.user!, 'records.correct');
    return this.customers.create(input);
  }
  @RequirePermission('workspace.read')
  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.customers.detail(id);
  }
  @RequirePermission('customers.write')
  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown) {
    return this.customers.update(id, parse(updateCustomerSchema, body));
  }
  @RequirePermission('workspace.read')
  @Get(':id/ledger')
  statement(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    return this.customers.statement(id, parse(ledgerQuerySchema, query));
  }
  @RequirePermission('customers.write')
  @Post(':id/payments')
  post(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = parse(accountPaymentSchema, body);
    if (input.kind === 'ADVANCE_REFUND')
      requirePermission(req.user!, 'records.correct');
    return this.customers.post(id, input);
  }
  @RequirePermission('records.correct')
  @Post(':id/entries/:entryId/reverse')
  reverse(
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
