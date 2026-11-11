export const SITE_NAME = 'Crushduo';
/** Adresse de support affichée sur la page Contact et dans les pieds de page. */
export const SUPPORT_EMAIL = 'support@crushduo.com';
/** Comptes officiels par langue (adresse complète du profil). Une adresse vide masque l'icône ; si l'adresse anglaise est vide, l'adresse française est utilisée. */
export const SOCIAL_LINKS = {
  fr: { facebook: '', instagram: '', tiktok: '' },
  en: { facebook: '', instagram: '', tiktok: '' },
} as const;
export type SocialKey = keyof (typeof SOCIAL_LINKS)['fr'];
/** Adresse du réseau pour la langue de la page (repli sur le français). */
export const socialUrl = (locale: string, key: SocialKey): string => (locale === 'en' ? SOCIAL_LINKS.en[key] || SOCIAL_LINKS.fr[key] : SOCIAL_LINKS.fr[key]);
/** Adresse publique du site : sitemap, aperçu de partage (Open Graph), adresses canoniques. En production, sans variable `NEXT_PUBLIC_SITE_URL`, c'est crushduo.com (jamais localhost :
 *  la valeur est figée à la compilation, et une adresse locale dans le sitemap ou dans l'image d'aperçu rend les deux inutilisables). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.NODE_ENV === 'production' ? 'https://crushduo.com' : 'http://localhost:3000')).trim();
export const API_PUBLIC_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').trim();
/** Pages publiques indexables (sitemap) — jamais d'espace membre ni de contenu privé. */
export const PUBLIC_PATHS = ['', '/how-it-works', '/pricing', '/about', '/blog', '/contact', '/help', '/install', '/legal/terms', '/legal/privacy', '/legal/cookies', '/legal/community'] as const;
