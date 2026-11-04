import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { Button } from '@duomatch/ui';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.contact'), description: t('contact.lead') };
}

// Adresse de support à définir au déploiement (aucune boîte réelle n'est présumée).
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@duomatch.example';

export default function Contact({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations();
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-4xl font-extrabold">{t('contact.title')}</h1>
      <p className="mt-4 text-lg text-muted">{t('contact.lead')}</p>
      <div className="mt-8 rounded-3xl border border-line bg-card p-8 shadow-soft">
        <Mail className="size-8 text-brand" aria-hidden />
        <p className="mt-4 font-semibold">{t('contact.emailLabel')}</p>
        <a className="text-lg text-brand-ink underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        <p className="mt-4 text-sm text-muted">{t('contact.sla')}</p>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('contact.subject'))}`} className="mt-6 inline-block"><Button>{t('contact.cta')}</Button></a>
      </div>
      <p className="mt-6 text-sm text-muted">{t('contact.urgent')}</p>
    </div>
  );
}
