import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { use } from 'react';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.about'), description: t('about.lead') };
}

const VALUES = ['respect', 'safety', 'privacy', 'sincerity'] as const;

export default function About({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-extrabold md:text-5xl">{t('about.title')}</h1>
      <p className="mt-5 text-xl text-muted">{t('about.lead')}</p>
      <p className="mt-6 text-lg">{t('about.mission')}</p>
      <h2 className="mt-12 text-2xl font-bold">{t('about.valuesTitle')}</h2>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        {VALUES.map((v) => (
          <div key={v} className="rounded-3xl border border-line bg-card p-6 shadow-soft"><dt className="font-bold">{t(`about.values.${v}.title`)}</dt><dd className="mt-1 text-muted">{t(`about.values.${v}.text`)}</dd></div>
        ))}
      </dl>
    </div>
  );
}
