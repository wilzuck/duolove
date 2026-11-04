import { Body, Controller, Get, HttpCode, Injectable, Module, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { BOOST_MINUTES, type CreditType } from '@duomatch/types';
import { CurrentUser, RequireVerified, type AuthUser } from '../common/auth.js';
import { badRequest } from '../common/errors.js';
import { zod } from '../common/zod.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreditsService } from '../subscriptions/credits.service.js';

const activateSchema = z.object({ creditType: z.enum(['BOOST_30', 'BOOST_120', 'BOOST_1440']) });

@Injectable()
export class BoostsService {
  constructor(private readonly prisma: PrismaService, private readonly credits: CreditsService) {}

  /**
   * Active un boost en consommant UN crédit, dans la même transaction que la création du boost :
   * si quoi que ce soit échoue (solde insuffisant, profil non prêt), rien n'est consommé.
   * Un boost déjà actif est prolongé (les durées s'additionnent).
   */
  async activate(userId: string, creditType: Exclude<CreditType, 'SUPER_LIKE' | 'MATCH_TOKEN'>) {
    const minutes = BOOST_MINUTES[creditType];
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { userId }, select: { boostedUntil: true, onboardedAt: true } });
      if (!profile?.onboardedAt) throw badRequest('PROFILE_INCOMPLETE');
      const now = new Date();
      const startsAt = profile.boostedUntil && profile.boostedUntil > now ? profile.boostedUntil : now;
      const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
      const boost = await tx.boost.create({ data: { userId, startsAt, endsAt, durationMinutes: minutes, source: 'credit' } });
      await this.credits.consume(tx, userId, creditType, 1, boost.id);
      await tx.profile.update({ where: { userId }, data: { boostedUntil: endsAt } });
      return { id: boost.id, startsAt, endsAt, durationMinutes: minutes };
    });
  }

  history(userId: string) {
    return this.prisma.boost.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 });
  }
}

@ApiTags('boosts')
@Controller()
export class BoostsController {
  constructor(private readonly boosts: BoostsService, private readonly credits: CreditsService) {}

  @Get('credits')
  async wallet(@CurrentUser() u: AuthUser) {
    const [balances, transactions] = await Promise.all([this.credits.balances(u.id), this.credits.history(u.id)]);
    return { balances, transactions: transactions.map((t) => ({ id: t.id, type: t.type, delta: t.delta, reason: t.reason, createdAt: t.createdAt })) };
  }

  @Get('boosts')
  history(@CurrentUser() u: AuthUser) { return this.boosts.history(u.id); }

  @RequireVerified() @HttpCode(200) @Post('boosts/activate')
  activate(@CurrentUser() u: AuthUser, @Body(zod(activateSchema)) body: { creditType: 'BOOST_30' | 'BOOST_120' | 'BOOST_1440' }) {
    return this.boosts.activate(u.id, body.creditType);
  }
}

@Module({ controllers: [BoostsController], providers: [BoostsService], exports: [BoostsService] })
export class BoostsModule {}
