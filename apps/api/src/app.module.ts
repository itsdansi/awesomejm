import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthService } from './auth/auth.service.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuditInterceptor } from './auth/audit.interceptor.js';
import { AuthController } from './auth/auth.controller.js';
import { PurchasesController } from './purchases/purchases.controller.js';
import { PurchasesService } from './purchases/purchases.service.js';
import { ReportsController } from './reports/reports.controller.js';
import { ReportsService } from './reports/reports.service.js';
import { OrdersController } from './orders/orders.controller.js';
import { OrdersService } from './orders/orders.service.js';
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
    AuthController,
    HealthController,
    InventoryController,
    RatesController,
    CustomersController,
    SalesController,
    OrdersController,
    PurchasesController,
    ReportsController,
  ],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    DatabaseService,
    InventoryService,
    RatesService,
    CustomersService,
    SalesService,
    OrdersService,
    PurchasesService,
    ReportsService,
  ],
})
export class AppModule {}
