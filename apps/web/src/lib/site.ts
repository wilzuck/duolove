export const SITE_NAME = 'CrushDuo';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
export const API_PUBLIC_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
/** Pages publiques indexables (sitemap) — jamais d'espace membre ni de contenu privé. */
export const PUBLIC_PATHS = ['', '/how-it-works', '/pricing', '/about', '/blog', '/contact', '/help', '/legal/terms', '/legal/privacy', '/legal/cookies', '/legal/community'] as const;
