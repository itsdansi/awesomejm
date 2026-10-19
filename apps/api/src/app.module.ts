import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { DatabaseService } from './database/database.service.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';
import { RatesController } from './rates/rates.controller.js';
import { RatesService } from './rates/rates.service.js';
import { CustomersController } from './customers/customers.controller.js';
import { CustomersService } from './customers/customers.service.js';
import { SalesController } from './sales/sales.controller.js';
import { SalesService } from './sales/sales.service.js';

@Module({
  controllers: [
    HealthController,
    InventoryController,
    RatesController,
    CustomersController,
    SalesController,
  ],
  providers: [
    DatabaseService,
    InventoryService,
    RatesService,
    CustomersService,
    SalesService,
  ],
})
export class AppModule {}
