import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { fetchPosts } from '@/lib/blog';
import { localeUrl, PUBLIC_PATHS, SITE_URL } from '@/lib/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = localeUrl;
  const fixed = PUBLIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: url(locale, path) || SITE_URL,
      lastModified: new Date(),
      changeFrequency: path === '' ? 'weekly' as const : 'monthly' as const,
      priority: path === '' ? 1 : 0.7,
      // `x-default` : la page à proposer quand la langue du visiteur n'est ni le français ni l'anglais (la version française, sans préfixe).
      alternates: { languages: { ...Object.fromEntries(routing.locales.map((l) => [l, url(l, path) || SITE_URL])), 'x-default': url(routing.defaultLocale, path) || SITE_URL } },
    })),
  );
  // Articles publiés : une entrée par langue ; les versions liées dans l'autre langue (traductions publiées) sont déclarées en alternates.
  const posts = (await Promise.all(routing.locales.map(async (locale) => (await fetchPosts(locale)).map((p) => {
    const tr = Object.entries(p.translations ?? {}).filter((e): e is [string, string] => !!e[1]);
    return {
      url: url(locale, `/blog/${p.slug}`), lastModified: p.publishedAt ? new Date(p.publishedAt) : new Date(), changeFrequency: 'monthly' as const, priority: 0.6,
      ...(tr.length ? { alternates: { languages: Object.fromEntries([[locale, url(locale, `/blog/${p.slug}`)], ...tr.map(([l, s]) => [l, url(l, `/blog/${s}`)])]) } } : {}),
    };
  })))).flat();
  return [...fixed, ...posts];
}
