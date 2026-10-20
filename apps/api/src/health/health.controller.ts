import { Public } from '../auth/policy.js';
import { Controller, Get } from '@nestjs/common';
import {
  healthResponseSchema,
  type HealthResponse,
} from '@awesomejm/contracts';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  getHealth(): HealthResponse {
    return healthResponseSchema.parse({
      status: 'ok',
      service: 'awesomejm-api',
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });
  }
}
