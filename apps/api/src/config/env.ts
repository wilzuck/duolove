import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().default('http://localhost:3000'),
  API_URL: z.string().default('http://localhost:4000'),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  REQUIRE_EMAIL_VERIFICATION: bool.default(true),
  GOOGLE_CLIENT_ID: z.string().optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('DuoMatch <no-reply@duomatch.app>'),
  UPLOAD_DIR: z.string().default('./uploads'),
  PAYMENT_PROVIDER: z.enum(['mock', 'kkiapay']).default('mock'),
  // Nom affiché dans le widget de paiement et sur les factures
  SITE_NAME: z.string().min(1).default('DuoMatch'),
  // KKiaPay (https://kkiapay.me) — requis si PAYMENT_PROVIDER=kkiapay
  KKIAPAY_PUBLIC_KEY: z.string().optional(),
  KKIAPAY_PRIVATE_KEY: z.string().optional(),
  // « Secret hash » défini dans Tableau de bord KKiaPay → Webhooks
  KKIAPAY_WEBHOOK_SECRET: z.string().optional(),
  KKIAPAY_SANDBOX: bool.default(true),
  PAYMENT_WEBHOOK_SECRET: z.string().default('dev-only-webhook-secret-change-me'),
  IP_HASH_SALT: z.string().default('dev-only-ip-salt'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Configuration invalide : ${JSON.stringify(parsed.error.flatten().fieldErrors)}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    const weak = [
      env.PAYMENT_WEBHOOK_SECRET.startsWith('dev-only'),
      env.IP_HASH_SALT.startsWith('dev-only'),
    ];
    if (weak.some(Boolean)) {
      throw new Error('Secrets de développement détectés en production : définissez PAYMENT_WEBHOOK_SECRET et IP_HASH_SALT.');
    }
  }
  if (env.PAYMENT_PROVIDER === 'kkiapay') {
    const missing = ['KKIAPAY_PUBLIC_KEY', 'KKIAPAY_PRIVATE_KEY', 'KKIAPAY_WEBHOOK_SECRET'].filter((k) => !env[k as keyof Env]);
    if (missing.length) throw new Error(`PAYMENT_PROVIDER=kkiapay : variables manquantes : ${missing.join(', ')}`);
  }
  cached = env;
  return env;
}

export const isProd = () => getEnv().NODE_ENV === 'production';
