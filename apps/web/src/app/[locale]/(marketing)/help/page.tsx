import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { Link } from '@/i18n/navigation';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.help'), description: t('help.lead') };
}

const SECTIONS = { account: ['verify', 'password', 'sessions', 'delete'], safety: ['scam', 'report', 'block', 'verified'], billing: ['pay', 'cancel', 'invoice', 'failed'], privacy: ['location', 'export', 'visibility'] } as const;

export default function Help({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-extrabold">{t('help.title')}</h1>
      <p className="mt-4 text-lg text-muted">{t('help.lead')}</p>
      {(Object.keys(SECTIONS) as Array<keyof typeof SECTIONS>).map((sec) => (
        <section key={sec} className="mt-10" aria-labelledby={`h-${sec}`}>
          <h2 id={`h-${sec}`} className="mb-4 text-2xl font-bold">{t(`help.sections.${sec}`)}</h2>
          <div className="space-y-3">
            {SECTIONS[sec].map((q) => (
              <details key={q} className="rounded-2xl border border-line bg-card px-5 py-4 open:shadow-soft">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{t(`help.items.${q}.q`)}</summary>
                <p className="mt-3 text-muted">{t(`help.items.${q}.a`)}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <p className="mt-12 text-muted">{t('help.more')} <Link href="/contact" className="text-brand-ink underline">{t('nav.contact')}</Link></p>
    </div>
  );
}
