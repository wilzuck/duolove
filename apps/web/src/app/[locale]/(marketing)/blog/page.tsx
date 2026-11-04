import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { Card } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { BLOG_SLUGS } from '@/lib/blog';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.blog'), description: t('blog.lead') };
}

export default function Blog({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations();
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-4xl font-extrabold">{t('blog.title')}</h1>
      <p className="mt-4 text-lg text-muted">{t('blog.lead')}</p>
      <div className="mt-10 grid gap-5 md:grid-cols-2">
        {BLOG_SLUGS.map((s) => (
          <Link key={s} href={`/blog/${s}`} className="group">
            <Card className="h-full space-y-3 p-6 transition group-hover:-translate-y-1 group-hover:shadow-pop">
              <h2 className="text-xl font-bold">{t(`blog.posts.${s}.title`)}</h2>
              <p className="text-muted">{t(`blog.posts.${s}.excerpt`)}</p>
              <span className="inline-flex items-center gap-1 font-semibold text-brand-ink">{t('blog.read')}<ArrowRight className="size-4" /></span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
