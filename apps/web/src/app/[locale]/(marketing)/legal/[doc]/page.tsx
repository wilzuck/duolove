import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

// Les conditions, la charte et les cookies ont leur propre page (legal/terms, legal/community, legal/cookies) ; ici, la confidentialité.
const DOCS = ['privacy'] as const;
type Doc = (typeof DOCS)[number];

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => DOCS.map((doc) => ({ locale, doc })));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  if (!DOCS.includes(doc as Doc)) return {};
  const t = await getTranslations({ locale });
  return { title: t(`legal.${doc as Doc}.title`) };
}

export default async function Legal({ params }: { params: Promise<{ locale: string; doc: string }> }) {
  const { locale, doc } = await params;
  setRequestLocale(locale);
  if (!DOCS.includes(doc as Doc)) notFound();
  const d = doc as Doc;
  const t = await getTranslations();
  const sections = t.raw(`legal.${d}.sections`) as Array<{ h: string; p: string }>;
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-extrabold">{t(`legal.${d}.title`)}</h1>
      <p className="mt-4 text-sm text-muted">{t('legal.updated')}</p>
      {sections.map((s) => (
        <section key={s.h} className="mt-8"><h2 className="text-xl font-bold">{s.h}</h2><p className="mt-2 text-muted">{s.p}</p></section>
      ))}
    </article>
  );
}
