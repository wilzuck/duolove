import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthUser } from '../common/auth.js';
import { ReferralService } from './referral.service.js';

@ApiTags('referral')
@Controller('referral')
export class ReferralController {
  constructor(private readonly referral: ReferralService) {}

  @Get('me')
  me(@CurrentUser() u: AuthUser) { return this.referral.summary(u.id); }
}

@Module({ controllers: [ReferralController], providers: [ReferralService], exports: [ReferralService] })
export class ReferralModule {}
