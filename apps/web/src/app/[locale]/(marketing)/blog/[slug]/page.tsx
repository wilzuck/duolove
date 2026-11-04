import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { BLOG_SLUGS, type BlogSlug } from '@/lib/blog';

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => BLOG_SLUGS.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  if (!BLOG_SLUGS.includes(slug as BlogSlug)) return {};
  const t = await getTranslations({ locale });
  return { title: t(`blog.posts.${slug as BlogSlug}.title`), description: t(`blog.posts.${slug as BlogSlug}.excerpt`) };
}

export default async function Post({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  if (!BLOG_SLUGS.includes(slug as BlogSlug)) notFound();
  const t = await getTranslations();
  const s = slug as BlogSlug;
  const tips = t.raw(`blog.posts.${s}.tips`) as string[];
  return (
    <article className="mx-auto max-w-2xl px-4 py-16">
      <Link href="/blog" className="text-sm font-semibold text-brand-ink">← {t('nav.blog')}</Link>
      <h1 className="mt-4 text-4xl font-extrabold">{t(`blog.posts.${s}.title`)}</h1>
      <p className="mt-5 text-lg text-muted">{t(`blog.posts.${s}.intro`)}</p>
      <ol className="mt-8 list-decimal space-y-4 pl-6 text-lg marker:font-bold marker:text-brand-ink">
        {tips.map((tip) => <li key={tip}>{tip}</li>)}
      </ol>
    </article>
  );
}
