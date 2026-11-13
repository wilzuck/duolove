import { Clock, Eye } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@duomatch/ui';
import { Markdown } from '@/components/marketing/Markdown';
import { LocaleAlternates } from '@/components/marketing/LocaleAlternates';
import { ViewBeacon } from '@/components/marketing/ViewBeacon';
import { Link } from '@/i18n/navigation';
import { fetchPost } from '@/lib/blog';
import { formatDate } from '@/lib/format';
import { localeUrl, SITE_URL } from '@/lib/site';
import type { BlogPostFull } from '@/lib/types';

/** Lien de l'article dans chaque langue où il existe (lui-même + ses traductions publiées). */
const pathsOf = (post: BlogPostFull, locale: string) => ({ [locale]: `/blog/${post.slug}`, ...Object.fromEntries(Object.entries(post.translations ?? {}).filter((e) => !!e[1]).map(([l, s]) => [l, `/blog/${s}`])) });

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const post = await fetchPost(slug, locale);
  if (!post) return {};
  const paths = pathsOf(post, locale);
  return {
    title: post.title, description: post.excerpt,
    alternates: { canonical: localeUrl(locale, paths[locale]), ...(Object.keys(paths).length > 1 ? { languages: Object.fromEntries(Object.entries(paths).map(([l, p]) => [l, localeUrl(l, p)])) } : {}) },
    openGraph: { title: post.title, description: post.excerpt, type: 'article', publishedTime: post.publishedAt ?? undefined, images: post.coverUrl ? [{ url: `${SITE_URL}${post.coverUrl}`, alt: post.coverAlt ?? post.title }] : undefined },
  };
}

export default async function Post({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const [t, post] = await Promise.all([getTranslations(), fetchPost(slug, locale)]);
  if (!post) notFound();
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <ViewBeacon slug={post.slug} locale={locale} />
      <LocaleAlternates paths={pathsOf(post, locale)} />
      <Link href="/blog" className="text-sm font-semibold text-brand-ink">← {t('blog.back')}</Link>
      <h1 className="mt-4 text-balance text-4xl font-extrabold md:text-5xl">{post.title}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 text-sm text-muted">
        {post.publishedAt && <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time>}
        <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{t('blog.minutes', { n: post.readMinutes })}</span>
        {post.views !== undefined && <span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden />{t('blog.views', { n: post.views })}</span>}
      </p>
      {post.coverUrl && <img src={post.coverUrl} alt={post.coverAlt ?? ''} width={1600} height={900} className="mt-8 aspect-video w-full rounded-3xl object-cover shadow-soft" />}
      <p className="mt-8 text-xl text-muted">{post.excerpt}</p>
      <div className="mt-8"><Markdown source={post.body} /></div>
      <aside className="mt-14 rounded-3xl bg-linear-to-br from-brand-strong to-brand-strong-2 p-8 text-center text-white shadow-pop">
        <h2 className="text-2xl font-extrabold">{t('blog.ctaTitle')}</h2>
        <p className="mx-auto mt-2 max-w-md text-white/90">{t('blog.ctaText')}</p>
        <Link href="/register" className="mt-6 inline-block"><Button size="lg" className="bg-white text-[#c2185b] hover:bg-white/90" variant="ghost">{t('blog.ctaButton')}</Button></Link>
      </aside>
    </article>
  );
}
