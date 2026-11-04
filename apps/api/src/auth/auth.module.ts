import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { ReferralModule } from '../referral/referral.controller.js';
import { MailModule } from '../mail/mail.service.js';

@Module({ imports: [MailModule, ReferralModule], controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
export class AuthModule {}
