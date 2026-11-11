export const SITE_NAME = 'Crushduo';
/** Adresse de support affichée sur la page Contact et dans les pieds de page. */
export const SUPPORT_EMAIL = 'support@crushduo.com';
export type SocialKey = 'facebook' | 'instagram' | 'tiktok' | 'whatsapp' | 'youtube' | 'x';
/** Adresse publique du site : sitemap, aperçu de partage (Open Graph), adresses canoniques. En production, sans variable `NEXT_PUBLIC_SITE_URL`, c'est crushduo.com (jamais localhost :
 *  la valeur est figée à la compilation, et une adresse locale dans le sitemap ou dans l'image d'aperçu rend les deux inutilisables). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.NODE_ENV === 'production' ? 'https://crushduo.com' : 'http://localhost:3000')).trim();
export const API_PUBLIC_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').trim();
/** Pages publiques indexables (sitemap) — jamais d'espace membre ni de contenu privé. */
export const PUBLIC_PATHS = ['', '/how-it-works', '/pricing', '/about', '/blog', '/contact', '/help', '/install', '/legal/terms', '/legal/privacy', '/legal/cookies', '/legal/community'] as const;
