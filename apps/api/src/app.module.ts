import { Controller, Get, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { FlagGuard, FlagsModule } from './common/flags.js';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.controller.js';
import { BoostsModule } from './boosts/boosts.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.controller.js';
import { RealtimeModule } from './chat/realtime.gateway.js';
import { AuthGuard, csrfOriginCheck, Public } from './common/auth.js';
import { AppError } from './common/errors.js';
import { getEnv, isProd } from './config/env.js';
import { DiscoveryModule } from './discovery/discovery.controller.js';
import { HealthController } from './health/health.controller.js';
import { LiveModule } from './live/live.controller.js';
import { ReferralModule } from './referral/referral.controller.js';
import { MailModule, MailService } from './mail/mail.service.js';
import { MatchesModule } from './matches/matches.controller.js';
import { NotificationsModule } from './notifications/notifications.controller.js';
import { PrismaModule } from './prisma/prisma.service.js';
import { ProfilesModule } from './profiles/profiles.controller.js';
import { ReportsModule } from './reports/reports.controller.js';
import { StorageModule } from './storage/storage.service.js';
import { EntitlementsModule } from './subscriptions/entitlements.service.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.controller.js';
import { SwipesModule } from './swipes/swipes.controller.js';
import { UsersModule } from './users/users.controller.js';

/** Boîte d'envoi des e-mails de développement : indisponible en production. */
@Controller('dev')
class DevController {
  constructor(private readonly mail: MailService) {}
  @Public() @Get('outbox')
  outbox() {
    if (isProd()) throw new AppError(404, 'NOT_FOUND', 'Not found');
    return this.mail.outbox;
  }
}

@Module({
  imports: [
    // Limite globale ; des limites plus strictes s'appliquent aux routes sensibles (@Throttle).
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }], skipIf: () => getEnv().NODE_ENV === 'test' }),
    PrismaModule, FlagsModule, MailModule, StorageModule, RealtimeModule, EntitlementsModule, NotificationsModule,
    AuthModule, UsersModule, ProfilesModule, DiscoveryModule, SwipesModule, MatchesModule, ChatModule,
    SubscriptionsModule, BoostsModule, LiveModule, ReferralModule, ReportsModule, AdminModule,
  ],
  controllers: [HealthController, DevController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_GUARD, useClass: AuthGuard }, { provide: APP_GUARD, useClass: FlagGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(csrfOriginCheck).forRoutes('*');
  }
}
