export const SITE_NAME = 'CrushDuo';
/** Adresse de support affichée sur la page Contact et dans les pieds de page. */
export const SUPPORT_EMAIL = 'support@crushduo.com';
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').trim();
export const API_PUBLIC_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').trim();
/** Pages publiques indexables (sitemap) — jamais d'espace membre ni de contenu privé. */
export const PUBLIC_PATHS = ['', '/how-it-works', '/pricing', '/about', '/blog', '/contact', '/help', '/install', '/legal/terms', '/legal/privacy', '/legal/cookies', '/legal/community'] as const;
