import { RequirePermission } from '../auth/policy.js';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  inventoryQuerySchema,
  receiveItemSchema,
  voidReceiptSchema,
} from '@awesomejm/contracts';
import { InventoryService } from './inventory.service.js';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermission('workspace.read')
  @Get('items')
  list(@Query() query: unknown) {
    const parsed = inventoryQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    return this.inventory.list(parsed.data);
  }
  @RequirePermission('workspace.read')
  @Get('summary')
  summary() {
    return this.inventory.summary();
  }
  @RequirePermission('inventory.write')
  @Post('items')
  receive(@Body() body: unknown) {
    const parsed = receiveItemSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map(
          (issue) => `${issue.path.join('.')}: ${issue.message}`,
        ),
      );
    return this.inventory.receive(parsed.data);
  }
  @RequirePermission('workspace.read')
  @Get('items/:id/history')
  history(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.inventory.history(id);
  }
  @Post('items/:id/void')
  @HttpCode(200)
  @RequirePermission('records.correct')
  voidReceipt(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    const parsed = voidReceiptSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message),
      );
    return this.inventory.voidReceipt(id, parsed.data.reason);
  }
}
