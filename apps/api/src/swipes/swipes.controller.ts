import { Body, Controller, Get, HttpCode, Module, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { swipeSchema, type SwipeInput } from '@duomatch/types';
import { CurrentUser, RequireVerified, type AuthUser } from '../common/auth.js';
import { zod } from '../common/zod.pipe.js';
import { CreditsService } from '../subscriptions/credits.service.js';
import { EntitlementsService } from '../subscriptions/entitlements.service.js';
import { SwipesService } from './swipes.service.js';

@ApiTags('swipes')
@RequireVerified()
@Controller('swipes')
export class SwipesController {
  constructor(private readonly swipes: SwipesService, private readonly ent: EntitlementsService, private readonly credits: CreditsService) {}

  @HttpCode(200) @Post()
  swipe(@CurrentUser() u: AuthUser, @Body(zod(swipeSchema)) body: SwipeInput) {
    return this.swipes.swipe(u.id, body);
  }

  @HttpCode(200) @Post('rewind')
  rewind(@CurrentUser() u: AuthUser) { return this.swipes.rewind(u.id); }

  @Get('received')
  received(@CurrentUser() u: AuthUser, @Query('cursor') cursor?: string) { return this.swipes.received(u.id, cursor); }

  @Get('sent')
  sent(@CurrentUser() u: AuthUser, @Query('cursor') cursor?: string) { return this.swipes.sent(u.id, cursor); }

  @Get('usage')
  async usage(@CurrentUser() u: AuthUser) {
    const [used, e, credits] = await Promise.all([this.swipes.usage(u.id), this.ent.get(u.id), this.credits.balances(u.id)]);
    return { used, limits: { dailyLikes: e.limits.dailyLikes, unlimitedLikes: e.limits.unlimitedLikes, superLikesWeekly: e.limits.superLikesWeekly }, credits, plan: e.plan };
  }
}

@Module({ controllers: [SwipesController], providers: [SwipesService], exports: [SwipesService] })
export class SwipesModule {}
