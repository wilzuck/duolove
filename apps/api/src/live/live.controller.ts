import { Body, Controller, Delete, Get, HttpCode, Module, OnModuleInit, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser, RequireVerified, type AuthUser } from '../common/auth.js';
import { RequireFlag } from '../common/flags.js';
import { zod } from '../common/zod.pipe.js';
import { RealtimeGateway } from '../chat/realtime.gateway.js';
import { LiveService } from './live.service.js';

const optInSchema = z.object({ enabled: z.boolean() });

/** Menu « Match » : recherche en direct, invitations, ouverture de conversation avec jetons. */
@ApiTags('live')
@RequireVerified()
@Controller('live')
@RequireFlag('live_match')
export class LiveController {
  constructor(private readonly live: LiveService) {}

  @Get('state') state(@CurrentUser() u: AuthUser) { return this.live.state(u.id); }

  // Les critères sont validés par le service avec le schéma partagé (messages d'erreur homogènes).
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) @HttpCode(200) @Post('searches')
  start(@CurrentUser() u: AuthUser, @Body() body: unknown) { return this.live.start(u.id, body); }

  @Delete('searches/active') cancel(@CurrentUser() u: AuthUser) { return this.live.cancel(u.id); }

  @Get('invites') incoming(@CurrentUser() u: AuthUser) { return this.live.incoming(u.id); }

  @Throttle({ default: { limit: 30, ttl: 60_000 } }) @HttpCode(200) @Post('invites/:id/accept')
  accept(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.live.respond(u.id, id, true); }

  @Throttle({ default: { limit: 30, ttl: 60_000 } }) @HttpCode(200) @Post('invites/:id/decline')
  decline(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.live.respond(u.id, id, false); }

  @Throttle({ default: { limit: 20, ttl: 60_000 } }) @HttpCode(200) @Post('invites/:id/choose')
  choose(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.live.choose(u.id, id); }

  @Put('opt-in') optIn(@CurrentUser() u: AuthUser, @Body(zod(optInSchema)) b: z.infer<typeof optInSchema>) { return this.live.setOptIn(u.id, b.enabled); }
}

@Module({ controllers: [LiveController], providers: [LiveService], exports: [LiveService] })
export class LiveModule implements OnModuleInit {
  constructor(private readonly live: LiveService, private readonly gateway: RealtimeGateway) {}
  onModuleInit() { this.gateway.onPresence = (id) => void this.live.onPresence(id); }
}
