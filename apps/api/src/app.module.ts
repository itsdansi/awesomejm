import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { DatabaseService } from './database/database.service.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';
import { RatesController } from './rates/rates.controller.js';
import { RatesService } from './rates/rates.service.js';

@Module({
  controllers: [HealthController, InventoryController, RatesController],
  providers: [DatabaseService, InventoryService, RatesService],
})
export class AppModule {}
