import { LifeBuoy } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { HelpCenter } from '@/components/marketing/HelpCenter';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.help'), description: t('help.lead') };
}

export default async function Help({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <>
      <section className="hero-glow">
        <div className="mx-auto max-w-3xl px-4 pt-16 pb-16 text-center md:pt-24 md:pb-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft"><LifeBuoy className="size-4" aria-hidden />{t('help.kicker')}</p>
          <h1 className="mt-6 text-balance text-4xl font-extrabold md:text-5xl">{t('help.title')}</h1>
          <p className="mx-auto mt-4 max-w-xl text-balance text-lg text-muted">{t('help.lead')}</p>
        </div>
      </section>
      <HelpCenter />
    </>
  );
}
