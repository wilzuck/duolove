import {
  Body, Controller, Delete, Get, Header, HttpCode, Module, Param, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { messageSchema } from '@duomatch/types';
import { CurrentUser, RequireVerified, type AuthUser } from '../common/auth.js';
import { RequireFlag } from '../common/flags.js';
import { badRequest } from '../common/errors.js';
import { zod } from '../common/zod.pipe.js';
import { StorageModule } from '../storage/storage.service.js';
import { ChatService } from './chat.service.js';

@ApiTags('conversations')
@RequireVerified()
@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  list(@CurrentUser() u: AuthUser, @Query('q') q?: string) { return this.chat.list(u.id, q); }

  @Get('conversations/:id/messages')
  history(@CurrentUser() u: AuthUser, @Param('id') id: string, @Query('cursor') cursor?: string, @Query('limit') limit = '30') {
    return this.chat.history(u.id, id, Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100), cursor);
  }

  @Post('conversations/:id/messages')
  send(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(zod(messageSchema)) body: { body: string }) {
    return this.chat.send(u.id, id, body.body);
  }

  @ApiConsumes('multipart/form-data')
  @RequireFlag('chat_images')
  @Post('conversations/:id/images')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 6 * 1024 * 1024, files: 1 } }))
  image(@CurrentUser() u: AuthUser, @Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw badRequest('FILE_REQUIRED');
    return this.chat.sendImage(u.id, id, file.buffer);
  }

  @HttpCode(200) @Post('conversations/:id/read')
  read(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.chat.markRead(u.id, id); }

  @Delete('messages/:id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.chat.deleteMessage(u.id, id); }

  /** Pièce jointe privée : servie uniquement aux deux membres de la conversation. */
  @Get('conversations/attachments/:id')
  @Header('Content-Type', 'image/webp')
  @Header('Cache-Control', 'private, max-age=3600')
  async attachment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res() res: Response) {
    res.end(await this.chat.attachment(u.id, id));
  }
}

@Module({ imports: [StorageModule], controllers: [ChatController], providers: [ChatService], exports: [ChatService] })
export class ChatModule {}
