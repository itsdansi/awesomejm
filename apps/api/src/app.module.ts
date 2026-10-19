import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { DatabaseService } from './database/database.service.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';

@Module({
  controllers: [HealthController, InventoryController],
  providers: [DatabaseService, InventoryService],
})
export class AppModule {}
