import { ArrowRight, Clock, Eye } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { fetchPosts } from '@/lib/blog';
import { formatDate } from '@/lib/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.blog'), description: t('blog.lead') };
}

export default async function Blog({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, posts] = await Promise.all([getTranslations(), fetchPosts(locale)]);
  const first = posts.find((p) => p.featured) ?? posts[0];  // l'article « à la une » choisi par l'administration, sinon le plus récent
  const rest = posts.filter((p) => p !== first);
  const meta = (p: { publishedAt: string | null; readMinutes: number; views?: number }) => (
    <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted">
      {p.publishedAt && <time dateTime={p.publishedAt}>{formatDate(p.publishedAt, locale)}</time>}
      <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{t('blog.minutes', { n: p.readMinutes })}</span>
      {p.views !== undefined && <span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden />{t('blog.views', { n: p.views })}</span>}
    </p>
  );
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-4xl font-extrabold md:text-5xl">{t('blog.title')}</h1>
      <p className="mt-4 text-lg text-muted">{t('blog.lead')}</p>
      {!first && <p className="mt-12 rounded-3xl border border-line bg-card p-10 text-center text-muted">{t('blog.empty')}</p>}
      {first && (
        <Link href={`/blog/${first.slug}`} className="group mt-10 block">
          <Card className="grid overflow-hidden transition group-hover:shadow-pop md:grid-cols-2">
            {first.coverUrl && <img src={first.coverUrl} alt={first.coverAlt ?? ''} width={1600} height={900} className="aspect-video h-full w-full object-cover md:aspect-auto" />}
            <div className="flex flex-col justify-center gap-3 p-7 md:p-10">
              <span className="w-fit rounded-full bg-soft px-3 py-1 text-xs font-bold text-brand-ink">{t('blog.latest')}</span>
              <h2 className="text-2xl font-extrabold md:text-3xl">{first.title}</h2>
              <p className="text-muted">{first.excerpt}</p>
              {meta(first)}
              <span className="inline-flex items-center gap-1 font-semibold text-brand-ink">{t('blog.read')}<ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden /></span>
            </div>
          </Card>
        </Link>
      )}
      {rest.length > 0 && (
        <section aria-labelledby="more" className="mt-12">
          <h2 id="more" className="text-xl font-bold">{t('blog.more')}</h2>
          <div className="mt-5 grid gap-6 md:grid-cols-2">
            {rest.map((p) => (
              <Link key={p.id} href={`/blog/${p.slug}`} className="group">
                <Card className="h-full overflow-hidden transition group-hover:-translate-y-1 group-hover:shadow-pop">
                  {p.coverThumbUrl && <img src={p.coverThumbUrl} alt={p.coverAlt ?? ''} width={800} height={450} loading="lazy" className="aspect-video w-full object-cover" />}
                  <div className="space-y-2 p-6">
                    <h3 className="text-xl font-bold">{p.title}</h3>
                    <p className="text-muted">{p.excerpt}</p>
                    {meta(p)}
                    <span className="inline-flex items-center gap-1 font-semibold text-brand-ink">{t('blog.read')}<ArrowRight className="size-4" aria-hidden /></span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
