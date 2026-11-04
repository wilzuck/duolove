import { Global, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { getEnv, isProd } from '../config/env.js';

export interface OutboxMessage { to: string; subject: string; text: string; at: string }

/** Envoie via SMTP si SMTP_URL est défini ; sinon journalise et garde une boîte d'envoi mémoire (dev/tests uniquement). */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter | null;
  readonly outbox: OutboxMessage[] = [];

  constructor() {
    const url = getEnv().SMTP_URL;
    this.transporter = url ? nodemailer.createTransport(url) : null;
  }

  async send(to: string, subject: string, text: string) {
    if (this.transporter) {
      await this.transporter.sendMail({ from: getEnv().MAIL_FROM, to, subject, text });
      return;
    }
    if (isProd()) {
      this.logger.error('SMTP_URL non défini en production : e-mail non envoyé');
      return;
    }
    this.outbox.push({ to, subject, text, at: new Date().toISOString() });
    if (this.outbox.length > 50) this.outbox.shift();
    this.logger.log(`[dev] e-mail à ${to} : ${subject}`);
  }

  sendVerification(to: string, name: string, token: string) {
    return this.send(
      to,
      'Confirmez votre adresse e-mail — DuoMatch',
      `Bonjour ${name},\n\nBienvenue sur DuoMatch ! Confirmez votre adresse : ${getEnv().APP_URL}/verify-email?token=${token}\n\nCe lien expire dans 24 h. Si vous n'êtes pas à l'origine de cette inscription, ignorez ce message.`,
    );
  }
  sendPasswordReset(to: string, name: string, token: string) {
    return this.send(
      to,
      'Réinitialisation de votre mot de passe — DuoMatch',
      `Bonjour ${name},\n\nPour choisir un nouveau mot de passe : ${getEnv().APP_URL}/reset-password?token=${token}\n\nLien valable 1 h. Si vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.`,
    );
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
