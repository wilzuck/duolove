import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { PUBLIC_PATHS, SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const url = (locale: string, path: string) => `${SITE_URL}${locale === routing.defaultLocale ? '' : `/${locale}`}${path}` || SITE_URL;
  return PUBLIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: url(locale, path) || SITE_URL,
      lastModified: new Date(),
      changeFrequency: path === '' ? 'weekly' as const : 'monthly' as const,
      priority: path === '' ? 1 : 0.7,
      alternates: { languages: Object.fromEntries(routing.locales.map((l) => [l, url(l, path) || SITE_URL])) },
    })),
  );
}
