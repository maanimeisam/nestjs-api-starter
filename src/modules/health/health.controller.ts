import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/auth.decorators.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    private readonly indicator: HealthIndicatorService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOkResponse()
  @ApiServiceUnavailableResponse()
  check(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.indicator.check('application').up(),
      () => this.database.pingCheck('database').withTimeout(1_500),
    ]);
  }
}
