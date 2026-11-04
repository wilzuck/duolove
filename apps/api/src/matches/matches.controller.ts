import { Controller, Delete, Get, Module, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequireVerified, type AuthUser } from '../common/auth.js';
import { notFound } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChatModule } from '../chat/chat.controller.js';
import { ChatService } from '../chat/chat.service.js';

@ApiTags('matches')
@RequireVerified()
@Controller('matches')
export class MatchesController {
  constructor(private readonly prisma: PrismaService, private readonly chat: ChatService) {}

  /** Mes matchs actifs (les conversations classées par activité récente). */
  @Get()
  list(@CurrentUser() u: AuthUser) { return this.chat.list(u.id); }

  /** Unmatch : ferme la conversation pour les deux. Les décisions précédentes restent : le profil ne réapparaît pas. */
  @Delete(':id')
  async unmatch(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const r = await this.prisma.match.updateMany({
      where: { id, status: 'ACTIVE', OR: [{ userAId: u.id }, { userBId: u.id }] },
      data: { status: 'UNMATCHED', unmatchedById: u.id },
    });
    if (!r.count) throw notFound('MATCH_NOT_FOUND');
    return { ok: true };
  }
}

@Module({ imports: [ChatModule], controllers: [MatchesController] })
export class MatchesModule {}
