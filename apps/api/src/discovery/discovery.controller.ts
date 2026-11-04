import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequireVerified, type AuthUser } from '../common/auth.js';
import { DiscoveryService } from './discovery.service.js';

@ApiTags('discovery')
@RequireVerified()
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get()
  feed(@CurrentUser() u: AuthUser, @Query('limit') limit = '10', @Query('cursor') cursor?: string) {
    return this.discovery.feed(u.id, Math.min(Math.max(parseInt(limit, 10) || 10, 1), 30), cursor);
  }

  @Get('count')
  count(@CurrentUser() u: AuthUser) {
    return this.discovery.count(u.id);
  }
}

@Module({ controllers: [DiscoveryController], providers: [DiscoveryService], exports: [DiscoveryService] })
export class DiscoveryModule {}
