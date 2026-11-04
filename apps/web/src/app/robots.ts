import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Jamais d'indexation des espaces membre/admin, des conversations ni des données privées.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/en/admin', '/discover', '/messages', '/likes', '/profile', '/settings', '/notifications', '/premium', '/checkout', '/onboarding', '/en/discover', '/en/messages', '/en/likes', '/en/profile', '/en/settings', '/en/notifications', '/en/premium', '/en/checkout', '/en/onboarding'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
